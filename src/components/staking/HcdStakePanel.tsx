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
  DEFAULT_HCD_INDICATORS,
  getHcdLtvMax,
  rebalanceLockMessage,
  type HcdLayerTarget,
  type HcdSymbol,
  type HcdIndicators,
  type QuarterlyRebalanceStatus,
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
import { getAggregatedPortfolioTotals, ensurePortfolioData } from '@/lib/portfolioData';
import {
  ALCHEMIX_FALLBACK_PLAN_EN,
  ALCHEMIX_FALLBACK_PLAN_SK,
  buildEthLayerPlanState,
  buildSolLayerPlanState,
  capCopyDeltasToAvailable,
  computeCapitalFunnel,
  computeDeltaQty,
  computeDeployedAlchemixQty,
  computeDeployedCoreQty,
  computeGasBuffer,
  computeTakeProfitUsdcDelta,
  formatAlchemixPlanInstruction,
  formatArbitrumPlanInstruction,
  formatGasBufferPlanLine,
  formatKaminoPlanInstruction,
  getActionPlanLtvCaps,
  layerTargetQty,
  tacticalBorrowAtTargetLtv,
  TAKE_PROFIT_FULFILLED_EN,
  TAKE_PROFIT_FULFILLED_SK,
  TAKE_PROFIT_NO_PROFIT_EN,
  TAKE_PROFIT_NO_PROFIT_SK,
  TAKE_PROFIT_PLAN_EN,
  TAKE_PROFIT_PLAN_SK,
  resolveSymbolEarnedProfit,
  type AlchemixTacticalWinner,
  type ArbitrumTacticalWinner,
  type KaminoTacticalWinner,
} from '@/lib/hcdActionPlanLogic';
import type { ArbitrumRoutingSnapshot } from '@/lib/arbitrumProtocolRouting';
import type { KaminoRoutingSnapshot } from '@/lib/kaminoProtocolRouting';
import { useStablesByNetwork } from '@/hooks/useStablesByNetwork';
import { temperamentLabel } from '@/lib/hcdTemperament';
import {
  computeNetYield,
  computeProjectedLbtcQty,
  computeTotalLbtcApy,
  formatLbtcYieldLabel,
  resolveCyborgState,
  type CyborgAction,
} from '@/lib/cyborgTerminalEngine';
import {
  buildLbtcAccumulationPlan,
  formatLbtcAccumulationPlanLine,
  type LbtcAccumulationPlan,
} from '@/lib/lbtcAccumulationStrategy';

interface Props {
  lang: Lang;
  marketScore: number;
}

const NEUTRAL_FG = 50;
const NEUTRAL_RSI = 50;

const EMPTY_REBALANCE: QuarterlyRebalanceStatus = {
  unlocked: false,
  inQuarterlyMonth: false,
  currentMonthLabel: '—',
  nextOpeningLabel: '—',
  nextOpeningMonthIndex: 2,
};

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

function layerApy(layer: HcdLayerTarget, apys?: { rEth?: number; mSol?: number } | null): string | null {
  const rEthApy = apys?.rEth ?? 0;
  const mSolApy = apys?.mSol ?? 0;
  const layerId = layer?.id ?? '';
  if (layerId.includes('core') && layer?.asset === 'rETH') return `${rEthApy.toFixed(2)}%`;
  if (layerId.includes('core') && layer?.asset === 'mSOL') return `${mSolApy.toFixed(2)}%`;
  return null;
}

function tacticalCollateralQty(availableQty: number, layer: HcdLayerTarget | undefined): number {
  return layerTargetQty(availableQty, layer?.pctTarget);
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
  gray,
}: {
  prefix: string;
  amount: number;
  suffix?: string;
  lang: Lang;
  decimals?: number;
  muted?: boolean;
  usdMode?: boolean;
  gray?: boolean;
}) {
  const safeAmount = Number.isFinite(amount) ? amount : 0;
  const boxClass = gray
    ? 'border-border/50 bg-muted/30'
    : muted
      ? 'border-border/40 bg-muted/25 opacity-80'
      : 'border-violet-500/35 bg-violet-500/5';
  return (
    <div className={`rounded-lg border px-3 py-2.5 ${boxClass}`}>
      <p className="text-[11px] font-mono font-semibold text-foreground tabular-nums flex flex-wrap items-center gap-1.5">
        <span>{prefix}</span>
        {usdMode ? (
          <>
            <span>{formatUsd(safeAmount)}</span>
            <CopyAmountButton lang={lang} value={safeAmount} decimals={2} />
            <span>USD</span>
          </>
        ) : (
          <>
            <span>{safeAmount.toFixed(decimals)}</span>
            <CopyAmountButton lang={lang} value={safeAmount} decimals={decimals} />
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
  confirmLabel,
}: {
  lang: Lang;
  confirmed: boolean;
  disabled?: boolean;
  onConfirm: () => void;
  onRevert: () => void;
  confirmLabel?: string;
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
      {confirmLabel ?? (sk ? '✅ Potvrdiť exekúciu' : '✅ Confirm execution')}
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
  planSummary,
  copyCollateralQty,
  hideCopyBoxes = false,
  lbtcAccumulation,
  lbtcPlanConfirmed = false,
  onConfirmLbtc,
  onRevertLbtc,
  lbtcExecDisabled = false,
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
  planSummary?: string;
  copyCollateralQty?: number;
  hideCopyBoxes?: boolean;
  lbtcAccumulation?: LbtcAccumulationPlan | null;
  lbtcPlanConfirmed?: boolean;
  onConfirmLbtc?: () => void;
  onRevertLbtc?: () => void;
  lbtcExecDisabled?: boolean;
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
  const copyQty = copyCollateralQty ?? collateralQty;

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
        {planSummary && (
          <p className="text-foreground/90 font-medium whitespace-pre-line">{planSummary}</p>
        )}
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

      {!hideCopyBoxes && (
        <CyborgCommandLine
          prefix={sk ? 'Vložte presne:' : 'Deposit exactly:'}
          amount={copyQty}
          suffix={collateralLabel}
          lang={lang}
          decimals={collateralDecimals}
          muted={lineMuted}
        />
      )}

      {!hideCopyBoxes && showBorrowCommand && (
        <CyborgCommandLine
          prefix={sk ? 'Požičajte si max:' : 'Borrow max:'}
          amount={safeBorrowUsdc}
          suffix="USDC"
          lang={lang}
          decimals={2}
          muted={lineMuted}
        />
      )}

      {showBorrowFlow && combinedBorrowUsdc > 0 && !lbtcAccumulation?.enabled && (
        <>
          {!hideCopyBoxes && (
            <CyborgCommandLine
              prefix={sk ? 'Kúpte LBTC za:' : 'Buy LBTC for:'}
              amount={projectedLbtcUsd}
              lang={lang}
              usdMode
              muted={lineMuted}
            />
          )}
          <p className="text-[9px] text-muted-foreground tabular-nums">
            {sk ? 'Kombinovaný úver ETH+SOL' : 'Combined ETH+SOL borrow'}: {(combinedBorrowUsdc ?? 0).toFixed(2)} USDC
            {(projectedLbtcQty ?? 0) > 0 && (
              <span> · ~{(projectedLbtcQty ?? 0).toFixed(6)} LBTC</span>
            )}
          </p>
          <p className="text-[9px] text-muted-foreground" title={lbtcYieldText}>
            Morpho borrow: {apyLabel(terminalApys.usdcBorrow)} · {lbtcYieldText}
          </p>
        </>
      )}

      {showBorrowFlow && lbtcAccumulation?.enabled && (
        <div className="rounded-lg border border-amber-500/25 bg-amber-500/5 p-2.5 space-y-2">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-[10px] font-bold uppercase tracking-wider text-amber-200/90">
              {sk ? 'LBTC akumulácia' : 'LBTC accumulation'}
            </p>
            {onConfirmLbtc && onRevertLbtc && (
              <ManualPlanConfirm
                lang={lang}
                confirmed={lbtcPlanConfirmed}
                disabled={lbtcExecDisabled || lbtcAccumulation.blocked || lbtcAccumulation.targetUsd <= 0}
                onConfirm={onConfirmLbtc}
                onRevert={onRevertLbtc}
                confirmLabel={sk ? 'Potvrdiť nákup LBTC' : 'Confirm LBTC buy'}
              />
            )}
          </div>

          {lbtcAccumulation.blocked ? (
            <p className="text-[10px] text-red-300/90 leading-snug">
              {sk ? lbtcAccumulation.blockReasonSk : lbtcAccumulation.blockReasonEn}
            </p>
          ) : (
            <>
              <p className="text-[10px] text-foreground/90 leading-snug">
                {sk
                  ? `Cieľový nákup: ${formatUsd(lbtcAccumulation.targetUsd)} · ${lbtcAccumulation.allocationPct.toFixed(1)} % z úveru`
                  : `Target buy: ${formatUsd(lbtcAccumulation.targetUsd)} · ${lbtcAccumulation.allocationPct.toFixed(1)} % of borrow`}
              </p>
              <p className="text-[10px] text-muted-foreground leading-snug">
                {sk ? 'DEX / Pool' : 'DEX / Pool'}:{' '}
                <span className="text-foreground font-medium">{lbtcAccumulation.dex.poolLabel}</span>
                {' · '}
                <a
                  href={lbtcAccumulation.dex.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-violet-300 hover:underline"
                >
                  {lbtcAccumulation.dex.name}
                </a>
              </p>
              <p className="text-[9px] text-muted-foreground">
                {sk ? lbtcAccumulation.dex.reasonSk : lbtcAccumulation.dex.reasonEn}
              </p>
              <p className="text-[9px] text-muted-foreground tabular-nums">
                {sk ? 'Dostupný borrowing power' : 'Available borrowing power'}:{' '}
                {lbtcAccumulation.availableBorrowingPowerUsd.toFixed(2)} USDC
                {' · '}
                {sk ? 'Projektované LTV' : 'Projected LTV'}: {lbtcAccumulation.projectedLtvPct.toFixed(1)}%
              </p>
              {!hideCopyBoxes && lbtcAccumulation.targetUsd > 0 && (
                <CyborgCommandLine
                  prefix={sk ? 'Vložte/Swapnite:' : 'Deposit/Swap:'}
                  amount={lbtcAccumulation.targetUsd}
                  suffix="USDC → LBTC"
                  lang={lang}
                  decimals={2}
                  gray
                  muted={lbtcPlanConfirmed}
                />
              )}
              {lbtcAccumulation.lbtcQty > 0 && (
                <p className="text-[9px] text-muted-foreground tabular-nums">
                  ≈ {lbtcAccumulation.lbtcQty.toFixed(6)} LBTC
                  {' · '}
                  {sk ? 'USDC rezerva' : 'USDC reserve'}: {lbtcAccumulation.stableReserveUsd.toFixed(2)}
                </p>
              )}
              <p className="text-[9px] text-muted-foreground" title={lbtcYieldText}>
                Morpho borrow: {apyLabel(terminalApys.usdcBorrow)} · {lbtcYieldText}
              </p>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function planKeyForLayer(layerId: string): string {
  return `hcd-plan-${layerId}`;
}

function TakeProfitCyborgActionPlan({
  sk,
  lang,
  symbol,
  takeProfitPct,
  profitUsd,
  takeProfitTargetUsdc,
  targetUsdc,
  deltaUsdc,
  targetMet,
  noProfit,
  planConfirmed,
  onConfirmPlan,
  onRevertPlan,
  execDisabled,
}: {
  sk: boolean;
  lang: Lang;
  symbol: HcdSymbol;
  takeProfitPct: number;
  profitUsd: number;
  takeProfitTargetUsdc: number;
  targetUsdc: number;
  deltaUsdc: number;
  targetMet: boolean;
  noProfit: boolean;
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
  const planSummary = noProfit
    ? (sk ? TAKE_PROFIT_NO_PROFIT_SK : TAKE_PROFIT_NO_PROFIT_EN)
    : (sk ? TAKE_PROFIT_PLAN_SK : TAKE_PROFIT_PLAN_EN);
  const confirmLabel = sk ? 'Vykonaj Swap do USDC' : 'Execute Swap to USDC';
  const buttonDisabled = execDisabled || noProfit;

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
          token="USDC"
          network={symbol === 'ETH' ? 'Multi-chain' : 'Solana'}
          protocol="Take Profit"
        />
        <ManualPlanConfirm
          lang={lang}
          confirmed={planConfirmed}
          disabled={buttonDisabled}
          onConfirm={onConfirmPlan}
          onRevert={onRevertPlan}
          confirmLabel={confirmLabel}
        />
      </div>

      <div className="space-y-1 text-[10px] text-muted-foreground leading-snug">
        <p className="text-foreground/90 font-medium">{planSummary}</p>
        {!noProfit && (
          <>
            <p>
              {sk ? 'Vygenerovaný zisk' : 'Earned profit'}:{' '}
              <span className="font-mono font-semibold text-foreground tabular-nums">
                {formatUsd(profitUsd)}
              </span>
            </p>
            <p>
              {sk ? 'Take Profit alokácia' : 'Take Profit allocation'}:{' '}
              <span className="text-foreground font-semibold">{(takeProfitPct * 100).toFixed(0)}%</span>
              {' · '}
              <span className="font-mono text-foreground tabular-nums">
                {formatUsd(takeProfitTargetUsdc)} USDC
              </span>
            </p>
            <p>
              {sk ? 'Cieľ USDC' : 'USDC target'}:{' '}
              <span className="font-mono font-semibold text-foreground tabular-nums">
                {targetUsdc.toFixed(2)} USDC
              </span>
            </p>
          </>
        )}
      </div>

      {noProfit ? (
        <CyborgCommandLine
          prefix={sk ? 'Swap do USDC:' : 'Swap to USDC:'}
          amount={0}
          suffix="USDC"
          lang={lang}
          decimals={2}
          muted={lineMuted}
          usdMode
        />
      ) : targetMet ? (
        <div
          className={`rounded-lg border px-3 py-2.5 ${
            lineMuted ? 'border-border/30 bg-muted/20 opacity-60' : 'border-border/50 bg-muted/30'
          }`}
        >
          <p className="text-[10px] font-mono text-foreground/90">
            {sk ? TAKE_PROFIT_FULFILLED_SK : TAKE_PROFIT_FULFILLED_EN}
          </p>
        </div>
      ) : (
        <CyborgCommandLine
          prefix={sk ? 'Swap do USDC:' : 'Swap to USDC:'}
          amount={deltaUsdc}
          suffix="USDC"
          lang={lang}
          decimals={2}
          muted={lineMuted}
          usdMode
        />
      )}
    </div>
  );
}

function TakeProfitLayerExecution({
  symbol,
  lang,
  layer,
  capitalFunnel,
  usdcBalance,
  rebalanceLocked,
  buildDecisionMeta,
}: {
  symbol: HcdSymbol;
  lang: Lang;
  layer: HcdLayerTarget;
  capitalFunnel: ReturnType<typeof computeCapitalFunnel>;
  usdcBalance: number;
  rebalanceLocked: boolean;
  buildDecisionMeta: () => DecisionConfirmMeta;
}) {
  const sk = lang === 'sk';
  const { confirmExecutionStep, revertExecutionStep, isExecutionConfirmed } = usePortfolio();
  const planKey = planKeyForLayer(layer?.id ?? 'gas');
  const planConfirmed = isExecutionConfirmed(planKey);
  const noProfit = !capitalFunnel?.hasEarnedProfit;
  const usdcDelta = useMemo(
    () => computeTakeProfitUsdcDelta(capitalFunnel?.takeProfitTargetUsdc, usdcBalance),
    [capitalFunnel?.takeProfitTargetUsdc, usdcBalance],
  );

  const handleConfirmPlan = useCallback(() => {
    confirmExecutionStep(planKey, {}, buildDecisionMeta());
    toast.success(sk ? 'Take Profit plán potvrdený' : 'Take Profit plan confirmed');
  }, [confirmExecutionStep, planKey, buildDecisionMeta, sk]);

  const handleRevertPlan = useCallback(() => {
    revertExecutionStep(planKey);
    toast.success(sk ? 'Exekúcia vrátená späť' : 'Execution reverted');
  }, [revertExecutionStep, planKey, sk]);

  return (
    <Collapsible
      defaultOpen
      className={`rounded-xl border transition-colors duration-500 ${
        planConfirmed ? 'border-emerald-500/50 bg-emerald-500/5' : 'border-amber-500/30 bg-amber-500/5'
      }`}
    >
      <CollapsibleTrigger className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left hover:bg-amber-500/5 transition-colors">
        <span className="text-[11px] font-semibold text-amber-200">
          {sk ? 'Exekúcia · Take Profit' : 'Execution · Take Profit'}
        </span>
        <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0 transition-transform [[data-state=open]_&]:rotate-180" />
      </CollapsibleTrigger>
      <CollapsibleContent className="px-3 pb-3">
        <TakeProfitCyborgActionPlan
          sk={sk}
          lang={lang}
          symbol={symbol}
          takeProfitPct={capitalFunnel?.takeProfitPercent ?? 0}
          profitUsd={capitalFunnel?.profitUsd ?? 0}
          takeProfitTargetUsdc={capitalFunnel?.takeProfitTargetUsdc ?? 0}
          targetUsdc={usdcDelta.targetUsdc}
          deltaUsdc={usdcDelta.deltaUsdc}
          targetMet={usdcDelta.targetMet}
          noProfit={noProfit}
          planConfirmed={planConfirmed}
          onConfirmPlan={handleConfirmPlan}
          onRevertPlan={handleRevertPlan}
          execDisabled={rebalanceLocked}
        />
      </CollapsibleContent>
    </Collapsible>
  );
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
  copyStakeQty,
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
  copyStakeQty?: number;
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
  const copyQty = copyStakeQty ?? stakeQty;

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
        amount={copyQty}
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
  stakedEntries,
  targetLtvPct,
  copyQtyOverride,
}: {
  symbol: HcdSymbol;
  lang: Lang;
  layer: HcdLayerTarget;
  totalQty: number;
  assetPrice: number;
  rebalanceLocked: boolean;
  apyText?: string | null;
  buildDecisionMeta: () => DecisionConfirmMeta;
  stakedEntries: StakedEntry[];
  targetLtvPct: number;
  copyQtyOverride?: number;
}) {
  const sk = lang === 'sk';
  const { confirmExecutionStep, revertExecutionStep, isExecutionConfirmed } = usePortfolio();
  const layerPct = layer?.pctTarget ?? 0;
  const stakeDecimals = symbol === 'SOL' ? 2 : 4;
  const stakeLabel = symbol === 'ETH' ? 'ETH' : 'SOL';
  const stakeQty = layerTargetQty(totalQty, layerPct);
  const stakeUsd = stakeQty * (assetPrice ?? 0);
  const deployedQty = computeDeployedCoreQty(stakedEntries, symbol);
  const copyStakeQty = copyQtyOverride ?? computeDeltaQty(stakeQty, deployedQty);
  const planKey = planKeyForLayer(layer?.id ?? 'core');
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
          copyStakeQty={copyStakeQty}
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
  targetLtvPct,
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
  arbitrumWinner,
  arbitrumRouting,
  kaminoWinner,
  kaminoRouting,
  totalPortfolioQty,
  copyQtyOverride,
  temperamentPct,
  btcPrice,
  maxLtvPct,
  lbtcQtyHeld,
  lbtcUsdHeld,
}: {
  symbol: HcdSymbol;
  lang: Lang;
  layer: HcdLayerTarget;
  totalQty: number;
  assetPrice: number;
  ltvMax: number;
  targetLtvPct: number;
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
  arbitrumWinner?: ArbitrumTacticalWinner;
  arbitrumRouting?: ArbitrumRoutingSnapshot | null;
  kaminoWinner?: KaminoTacticalWinner;
  kaminoRouting?: KaminoRoutingSnapshot | null;
  totalPortfolioQty: number;
  copyQtyOverride?: number;
  temperamentPct: number;
  btcPrice: number;
  maxLtvPct: number;
  lbtcQtyHeld: number;
  lbtcUsdHeld: number;
}) {
  const sk = lang === 'sk';
  const { confirmExecutionStep, revertExecutionStep, isExecutionConfirmed } = usePortfolio();
  const collateralDecimals = symbol === 'SOL' ? 2 : 4;
  const motorLabel = symbol === 'ETH'
    ? (arbitrumWinner?.collateralToken ?? 'wETH')
    : (kaminoWinner?.collateralToken ?? 'mSOL');
  const layerPct = layer?.pctTarget ?? 0;
  const collateralQty = layerTargetQty(totalQty, layerPct);
  const deployedCollateralQty = sumTacticalDeployedQty(stakedEntries ?? [], symbol);
  const copyCollateralQty = copyQtyOverride ?? computeDeltaQty(collateralQty, deployedCollateralQty);
  const collateralUsd = collateralQty * (assetPrice ?? 0);
  const safeBorrowUsdc = tacticalBorrowAtTargetLtv(copyCollateralQty, assetPrice, targetLtvPct);
  const planKey = planKeyForLayer(layer?.id ?? 'tactical');
  const lbtcPlanKey = `${planKey}-lbtc`;

  const lbtcAccumulation = useMemo(() => {
    if (symbol !== 'ETH' || !showBorrowFlow) return null;
    return buildLbtcAccumulationPlan({
      temperamentPct,
      collateralUsd: collateralQty * (assetPrice ?? 0),
      currentDebtUsd: usdcDebt ?? 0,
      proposedBorrowUsd: safeBorrowUsdc,
      maxLtvPct,
      btcPrice: btcPrice ?? 0,
    });
  }, [
    symbol,
    showBorrowFlow,
    temperamentPct,
    collateralQty,
    assetPrice,
    usdcDebt,
    safeBorrowUsdc,
    maxLtvPct,
    btcPrice,
  ]);

  const exitAlert = useMemo(() => {
    try {
      return computeTacticalWithdrawAlert({
        indicators: indicators ?? DEFAULT_HCD_INDICATORS,
        collateralQty,
        deployedCollateralQty,
        collateralPrice: assetPrice ?? 0,
        usdcDebt: usdcDebt ?? 0,
        tokenLabel: motorLabel,
        decimals: collateralDecimals,
      });
    } catch {
      return null;
    }
  }, [
    indicators,
    collateralQty,
    deployedCollateralQty,
    assetPrice,
    usdcDebt,
    motorLabel,
    collateralDecimals,
  ]);
  const planConfirmed = isExecutionConfirmed(planKey);
  const gasBufferLine = formatGasBufferPlanLine(symbol === 'ETH' ? 'ETH' : 'SOL', totalPortfolioQty, sk);
  const routing = symbol === 'ETH' && arbitrumWinner
    ? { token: arbitrumWinner.collateralToken, network: arbitrumWinner.network, protocol: arbitrumWinner.protocolName }
    : symbol === 'ETH'
      ? { token: 'wETH', network: 'Arbitrum', protocol: 'Morpho' }
      : kaminoWinner
        ? { token: kaminoWinner.collateralToken, network: kaminoWinner.network, protocol: kaminoWinner.protocolName }
        : { token: 'mSOL', network: 'Solana', protocol: 'Kamino' };
  const planSummary = symbol === 'ETH' && arbitrumWinner
    ? [
        formatArbitrumPlanInstruction(arbitrumWinner, sk, arbitrumRouting),
        lbtcAccumulation?.enabled ? formatLbtcAccumulationPlanLine(lbtcAccumulation, sk) : '',
      ].filter(Boolean).join('\n')
    : symbol === 'SOL' && kaminoWinner
      ? formatKaminoPlanInstruction(kaminoWinner, sk, kaminoRouting, gasBufferLine)
      : undefined;

  const buildPlanUpdate = useCallback((): PortfolioBalanceUpdate => {
    const update: PortfolioBalanceUpdate = {};
    if (symbol === 'ETH') {
      update.rEthQty = collateralQty;
      if (showBorrowFlow && !lbtcAccumulation?.enabled && projectedLbtcQty > 0) {
        update.lbtcQty = projectedLbtcQty;
      }
    } else {
      update.mSolQty = collateralQty;
    }
    if (safeBorrowUsdc > 0) update.usdcBorrowed = safeBorrowUsdc;
    return update;
  }, [symbol, collateralQty, safeBorrowUsdc, showBorrowFlow, projectedLbtcQty, lbtcAccumulation?.enabled]);

  const buildLbtcPlanUpdate = useCallback((): PortfolioBalanceUpdate => {
    if (!lbtcAccumulation?.enabled || lbtcAccumulation.blocked || lbtcAccumulation.lbtcQty <= 0) {
      return {};
    }
    return { lbtcQty: lbtcAccumulation.lbtcQty };
  }, [lbtcAccumulation]);

  const handleConfirmPlan = useCallback(() => {
    confirmExecutionStep(planKey, buildPlanUpdate(), buildDecisionMeta());
    toast.success(sk ? 'Exekúcia potvrdená · baseline aktualizovaný' : 'Execution confirmed · baseline updated');
  }, [confirmExecutionStep, planKey, buildPlanUpdate, buildDecisionMeta, sk]);

  const handleRevertPlan = useCallback(() => {
    revertExecutionStep(planKey);
    toast.success(sk ? 'Exekúcia vrátená späť' : 'Execution reverted');
  }, [revertExecutionStep, planKey, sk]);

  const lbtcPlanConfirmed = isExecutionConfirmed(lbtcPlanKey);

  const handleConfirmLbtc = useCallback(() => {
    const update = buildLbtcPlanUpdate();
    if (!update.lbtcQty) return;
    confirmExecutionStep(lbtcPlanKey, update, buildDecisionMeta());
    toast.success(sk ? 'Nákup LBTC potvrdený' : 'LBTC purchase confirmed');
  }, [buildLbtcPlanUpdate, confirmExecutionStep, lbtcPlanKey, buildDecisionMeta, sk]);

  const handleRevertLbtc = useCallback(() => {
    revertExecutionStep(lbtcPlanKey);
    toast.success(sk ? 'Nákup LBTC vrátený späť' : 'LBTC purchase reverted');
  }, [revertExecutionStep, lbtcPlanKey, sk]);

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
        {symbol === 'ETH' && (lbtcQtyHeld ?? 0) > 0 && (
          <p className="text-[10px] text-muted-foreground mb-2 tabular-nums">
            {sk ? 'LBTC expozícia' : 'LBTC exposure'}:{' '}
            <span className="font-mono font-semibold text-amber-200/90">
              {(lbtcQtyHeld ?? 0).toFixed(6)} LBTC
            </span>
            {' · '}
            {formatUsd(lbtcUsdHeld ?? 0)}
          </p>
        )}
        <CyborgActionPlan
          sk={sk}
          layerPct={layerPct}
          collateralQty={collateralQty}
          collateralLabel={motorLabel}
          collateralUsd={collateralUsd}
          safeBorrowUsdc={safeBorrowUsdc}
          ltvMax={targetLtvPct}
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
          planSummary={planSummary}
          copyCollateralQty={copyCollateralQty}
          lbtcAccumulation={lbtcAccumulation}
          lbtcPlanConfirmed={lbtcPlanConfirmed}
          onConfirmLbtc={symbol === 'ETH' ? handleConfirmLbtc : undefined}
          onRevertLbtc={symbol === 'ETH' ? handleRevertLbtc : undefined}
          lbtcExecDisabled={rebalanceLocked}
        />
      </CollapsibleContent>
    </Collapsible>
  );
}

function AlchemixLayerExecution({
  lang,
  layer,
  totalEthQty,
  totalPortfolioQty,
  ethPrice,
  rebalanceLocked,
  alchemixApyPct,
  buildDecisionMeta,
  alchemixLocked,
  alchemixWinner,
  copyQtyOverride,
  stakedEntries,
}: {
  lang: Lang;
  layer: HcdLayerTarget;
  totalEthQty: number;
  totalPortfolioQty: number;
  ethPrice: number;
  rebalanceLocked: boolean;
  alchemixApyPct: number;
  buildDecisionMeta: () => DecisionConfirmMeta;
  alchemixLocked: boolean;
  alchemixWinner?: AlchemixTacticalWinner;
  copyQtyOverride?: number;
  stakedEntries: StakedEntry[];
}) {
  const sk = lang === 'sk';
  const { confirmExecutionStep, revertExecutionStep, isExecutionConfirmed } = usePortfolio();
  const layerPct = alchemixLocked ? 0 : (layer?.pctTarget ?? 0);
  const targetQty = alchemixLocked ? 0 : layerTargetQty(totalEthQty, layer?.pctTarget);
  const targetUsd = targetQty * (ethPrice ?? 0);
  const deployedAlchemixQty = computeDeployedAlchemixQty(stakedEntries);
  const planKey = planKeyForLayer(layer?.id ?? 'alchemix');
  const planConfirmed = isExecutionConfirmed(planKey);
  const fallbackText = sk ? ALCHEMIX_FALLBACK_PLAN_SK : ALCHEMIX_FALLBACK_PLAN_EN;
  const gasBufferLine = formatGasBufferPlanLine('ETH', totalPortfolioQty, sk);
  const planSummary = alchemixLocked
    ? fallbackText
    : alchemixWinner
      ? formatAlchemixPlanInstruction(alchemixWinner, sk, gasBufferLine)
      : undefined;
  const exitAlert = useMemo(() => {
    if (alchemixLocked) return null;
    try {
      return computeAlchemixRebalanceAlert(alchemixApyPct ?? 0);
    } catch {
      return null;
    }
  }, [alchemixApyPct, alchemixLocked]);

  const handleConfirmPlan = useCallback(() => {
    confirmExecutionStep(planKey, { alchemixEthQty: targetQty }, buildDecisionMeta());
    toast.success(sk ? 'Exekúcia potvrdená · baseline aktualizovaný' : 'Execution confirmed · baseline updated');
  }, [confirmExecutionStep, planKey, targetQty, buildDecisionMeta, sk]);

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
          routing={{
            token: 'ETH',
            network: alchemixWinner?.network ?? 'Ethereum L1',
            protocol: 'Alchemix',
          }}
          exitAlert={exitAlert}
          planConfirmed={planConfirmed}
          onConfirmPlan={handleConfirmPlan}
          onRevertPlan={handleRevertPlan}
          execDisabled={rebalanceLocked || alchemixLocked}
          showBorrowCommand={false}
          planSummary={planSummary}
          hideCopyBoxes={alchemixLocked}
          copyCollateralQty={alchemixLocked ? 0 : (copyQtyOverride ?? computeDeltaQty(targetQty, deployedAlchemixQty))}
        />
        <p className="text-[9px] text-muted-foreground mt-2 px-1">
          {sk ? `${layer?.protocol ?? 'Alchemix'} · Bez likvidácie` : `${layer?.protocol ?? 'Alchemix'} · No liquidation`}
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
  arbitrumWinner,
  alchemixLocked,
  targetLtvPct,
  arbitrumRouting,
  kaminoWinner,
  kaminoRouting,
  alchemixWinner,
  temperamentPct,
  usdcBalance,
  profitUsd,
  btcPrice,
  maxLtvPct,
  lbtcQtyHeld,
  lbtcUsdHeld,
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
  arbitrumWinner?: ArbitrumTacticalWinner;
  alchemixLocked?: boolean;
  targetLtvPct: number;
  arbitrumRouting?: ArbitrumRoutingSnapshot | null;
  kaminoWinner?: KaminoTacticalWinner;
  kaminoRouting?: KaminoRoutingSnapshot | null;
  alchemixWinner?: AlchemixTacticalWinner;
  temperamentPct: number;
  usdcBalance: number;
  profitUsd: number;
  btcPrice: number;
  maxLtvPct: number;
  lbtcQtyHeld: number;
  lbtcUsdHeld: number;
}) {
  const sk = lang === 'sk';
  const { isExecutionConfirmed } = usePortfolio();
  const apys = useStakingSplitApys();
  const decimals = symbol === 'SOL' ? 2 : 3;
  const totalUsd = (totalPortfolioQty ?? 0) * (price ?? 0);
  const allocationQty = useMemo(
    () => computeGasBuffer(symbol === 'ETH' ? 'ETH' : 'SOL', totalPortfolioQty).availableQty,
    [symbol, totalPortfolioQty],
  );
  const capitalFunnel = useMemo(
    () => computeCapitalFunnel(allocationQty, temperamentPct, profitUsd),
    [allocationQty, temperamentPct, profitUsd],
  );
  const workingCapitalQty = capitalFunnel.workingCapitalQty;

  const layerCopyQtyById = useMemo(() => {
    const assetSymbol = symbol === 'ETH' ? 'ETH' : 'SOL';
    const rows: { id: string; delta: number }[] = [];

    for (const layer of layers ?? []) {
      const layerId = layer?.id ?? '';
      const isTactical = layerId.includes('tactical');
      const isAlchemix = layerId.includes('alchemix');
      const isCore = layerId.includes('core');
      if (!isTactical && !isAlchemix && !isCore) continue;

      const pct = isAlchemix && alchemixLocked ? 0 : (layer?.pctTarget ?? 0);
      const target = layerTargetQty(workingCapitalQty, pct);
      let deployed = 0;
      if (isCore) deployed = computeDeployedCoreQty(stakedEntries, assetSymbol);
      else if (isTactical) deployed = sumTacticalDeployedQty(stakedEntries ?? [], assetSymbol);
      else if (isAlchemix) deployed = computeDeployedAlchemixQty(stakedEntries);

      rows.push({ id: layerId, delta: computeDeltaQty(target, deployed) });
    }

    const capped = capCopyDeltasToAvailable(rows.map(r => r.delta), workingCapitalQty);
    return new Map(rows.map((r, i) => [r.id, capped[i] ?? 0]));
  }, [layers, workingCapitalQty, stakedEntries, symbol, alchemixLocked]);

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
          const layerId = layer?.id ?? '';
          const apy = layerApy(layer, apys);
          const isTactical = layerId.includes('tactical');
          const isAlchemix = layerId.includes('alchemix');
          const isCore = layerId.includes('core');
          const isGas = layerId.includes('gas');
          const isInfoOnly = !isTactical && !isAlchemix && !isCore && !isGas;
          const planKey = planKeyForLayer(layerId);
          const corePlanConfirmed = isCore && isExecutionConfirmed(planKey);
          const displayPct = isAlchemix && alchemixLocked ? 0 : (layer?.pctTarget ?? 0);

          return (
            <div
              key={layerId || `layer-${layer?.layer ?? 0}`}
              className={`rounded-xl border p-2.5 sm:p-3 space-y-2 min-w-0 ${
                corePlanConfirmed
                  ? 'border-border/30 bg-muted/20 opacity-75'
                  : 'border-border/50 bg-background/30'
              }`}
            >
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between min-w-0">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-violet-300/90">
                      Vrstva {layer?.layer ?? '—'}
                    </span>
                    <span className="text-xs font-semibold text-foreground">
                      {sk ? (layer?.nameSk ?? '') : (layer?.nameEn ?? '')}
                    </span>
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-1 break-words">
                    {layer?.asset ?? ''} · {layer?.protocol ?? ''}
                    {layer?.borrow && ` → Borrow: ${layer.borrow}`}
                    {apy && ` · APY ${apy}`}
                  </p>
                  {isTactical && symbol === 'ETH' && (lbtcQtyHeld ?? 0) > 0 && (
                    <p className="text-[9px] text-amber-200/80 mt-0.5 font-mono tabular-nums">
                      LBTC: {(lbtcQtyHeld ?? 0).toFixed(6)} · {formatUsd(lbtcUsdHeld ?? 0)}
                    </p>
                  )}
                  {(layer?.noteSk || layer?.noteEn) && (
                    <p className="text-[9px] text-emerald-400/80 mt-0.5">
                      {sk ? (layer?.noteSk ?? '') : (layer?.noteEn ?? '')}
                    </p>
                  )}
                </div>
                <div className="text-right shrink-0">
                  <p className="font-mono text-sm font-bold tabular-nums text-violet-200">
                    {displayPct.toFixed(1)}%
                  </p>
                  <p className="text-[9px] text-muted-foreground tabular-nums">
                    {layer?.pctMin ?? 0}–{layer?.pctMax ?? 0}%
                  </p>
                </div>
              </div>

              {isGas && (
                <TakeProfitLayerExecution
                  symbol={symbol}
                  lang={lang}
                  layer={layer}
                  capitalFunnel={capitalFunnel}
                  usdcBalance={usdcBalance}
                  rebalanceLocked={rebalanceLocked}
                  buildDecisionMeta={buildDecisionMeta}
                />
              )}

              {isTactical && (
                <TacticalLayerExecution
                  symbol={symbol}
                  lang={lang}
                  layer={layer}
                  totalQty={workingCapitalQty}
                  assetPrice={price}
                  ltvMax={ltvMax}
                  targetLtvPct={targetLtvPct}
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
                  arbitrumWinner={symbol === 'ETH' ? arbitrumWinner : undefined}
                  arbitrumRouting={symbol === 'ETH' ? arbitrumRouting : undefined}
                  kaminoWinner={symbol === 'SOL' ? kaminoWinner : undefined}
                  kaminoRouting={symbol === 'SOL' ? kaminoRouting : undefined}
                  totalPortfolioQty={totalPortfolioQty}
                  copyQtyOverride={layerCopyQtyById.get(layerId)}
                  temperamentPct={temperamentPct}
                  btcPrice={btcPrice}
                  maxLtvPct={maxLtvPct}
                  lbtcQtyHeld={lbtcQtyHeld}
                  lbtcUsdHeld={lbtcUsdHeld}
                />
              )}

              {isAlchemix && symbol === 'ETH' && (
                <AlchemixLayerExecution
                  lang={lang}
                  layer={layer}
                  totalEthQty={workingCapitalQty}
                  totalPortfolioQty={totalPortfolioQty}
                  ethPrice={price}
                  rebalanceLocked={rebalanceLocked}
                  alchemixApyPct={alchemixApyPct}
                  buildDecisionMeta={buildDecisionMeta}
                  alchemixLocked={Boolean(alchemixLocked)}
                  alchemixWinner={alchemixWinner}
                  copyQtyOverride={layerCopyQtyById.get(layerId)}
                  stakedEntries={stakedEntries}
                />
              )}

              {isCore && (
                <CoreLayerExecution
                  symbol={symbol}
                  lang={lang}
                  layer={layer}
                  totalQty={workingCapitalQty}
                  assetPrice={price}
                  rebalanceLocked={rebalanceLocked}
                  apyText={apy}
                  buildDecisionMeta={buildDecisionMeta}
                  stakedEntries={stakedEntries}
                  targetLtvPct={targetLtvPct}
                  copyQtyOverride={layerCopyQtyById.get(layerId)}
                />
              )}

              {isInfoOnly && !layer?.ledgerProtocol && (
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

function formatTimeSafe(d: Date | undefined | null): string {
  try {
    if (!d || !(d instanceof Date) || Number.isNaN(d.getTime())) return '—';
    return formatTime(d);
  } catch {
    return '—';
  }
}

export function HcdStakePanel({ lang, marketScore }: Props) {
  const sk = lang === 'sk';
  const { portfolioData: rawPortfolioData, isExecutionConfirmed, cyborgUsdcDebt, metrics } = usePortfolio();
  const portfolioData = ensurePortfolioData(rawPortfolioData);
  const { data: defiApys } = useDefiApys();
  const {
    indicators: rawIndicators,
    rebalance: rawRebalance,
    borrowLoading,
    borrowRates,
    temperamentPct: rawTemperamentPct,
  } = useHcdIndicators(lang);
  const safeIndicators = rawIndicators ?? DEFAULT_HCD_INDICATORS;
  const safeRebalance = rawRebalance ?? EMPTY_REBALANCE;
  const temperamentPct = rawTemperamentPct ?? 50;
  const { market, marketLoading, updating, refresh, unavailable: rawUnavailable, terminalApys } = useCyborgMarketData();
  const unavailable = rawUnavailable ?? [];
  const win = getTimingWindow(marketScore ?? 50);
  const [isEmergencyUnlocked, setIsEmergencyUnlocked] = useState(false);
  const rebalanceLocked = (!(safeRebalance?.unlocked ?? false) || (win?.locked ?? false)) && !isEmergencyUnlocked;
  const ltvCaps = useMemo(
    () => getActionPlanLtvCaps(safeIndicators, temperamentPct),
    [safeIndicators, temperamentPct],
  );
  const targetLtvPct = ltvCaps.targetLtvPct;
  const ltvMax = ltvCaps.maxLtvPct;
  const ltvRestricted = safeIndicators?.volatilityRegime === 'high' || Boolean(safeIndicators?.borrowWarning);

  const aggregated = useMemo(
    () => getAggregatedPortfolioTotals(portfolioData),
    [portfolioData],
  );
  const ethTotalQty = aggregated.ethQty;
  const solTotalQty = aggregated.solQty;
  const ethGasBuffer = useMemo(() => computeGasBuffer('ETH', ethTotalQty), [ethTotalQty]);
  const solGasBuffer = useMemo(() => computeGasBuffer('SOL', solTotalQty), [solTotalQty]);
  const availableEth = ethGasBuffer.availableQty;
  const availableSol = solGasBuffer.availableQty;
  const ethProfitUsd = useMemo(
    () => resolveSymbolEarnedProfit({
      metricsAsset: metrics?.assets?.find(a => a?.symbol === 'ETH'),
    }).profitUsd,
    [metrics?.assets],
  );
  const solProfitUsd = useMemo(
    () => resolveSymbolEarnedProfit({
      metricsAsset: metrics?.assets?.find(a => a?.symbol === 'SOL'),
    }).profitUsd,
    [metrics?.assets],
  );
  const ethCapitalFunnel = useMemo(
    () => computeCapitalFunnel(availableEth, temperamentPct, ethProfitUsd),
    [availableEth, temperamentPct, ethProfitUsd],
  );
  const solCapitalFunnel = useMemo(
    () => computeCapitalFunnel(availableSol, temperamentPct, solProfitUsd),
    [availableSol, temperamentPct, solProfitUsd],
  );
  const stablesByNetwork = useStablesByNetwork();
  const usdcBalance = useMemo(
    () => (stablesByNetwork?.ethereum ?? 0)
      + (stablesByNetwork?.arbitrum ?? 0)
      + (stablesByNetwork?.base ?? 0)
      + (stablesByNetwork?.solana ?? 0),
    [stablesByNetwork],
  );
  const ethPrice = aggregated.ethPrice;
  const solPrice = aggregated.solPrice;
  const btcPrice = portfolioData.prices?.btc ?? 0;

  const portfolioUsd = aggregated.portfolioUsd;
  const alchemixApyPct = defiApys?.alchemixVault ?? 2.2;
  const ethStakedEntries = portfolioData.assets?.ETH?.stakedEntries ?? [];
  const solStakedEntries = portfolioData.assets?.SOL?.stakedEntries ?? [];

  const ethLayers = useMemo(
    () => {
      try {
        return computeHcdLayerTargets('ETH', safeIndicators, temperamentPct) ?? [];
      } catch {
        return [];
      }
    },
    [safeIndicators, temperamentPct],
  );
  const solLayers = useMemo(
    () => {
      try {
        return computeHcdLayerTargets('SOL', safeIndicators, temperamentPct) ?? [];
      } catch {
        return [];
      }
    },
    [safeIndicators, temperamentPct],
  );

  const ethLayerPlan = useMemo(
    () => buildEthLayerPlanState({
      layers: ethLayers ?? [],
      alchemixApyPct,
      indicators: safeIndicators,
      fearGreed: market?.fearGreed ?? null,
      marketScore: marketScore ?? 50,
      arbitrumRouting: borrowRates?.arbitrumRouting ?? null,
      alchemixRouting: borrowRates?.alchemixRouting ?? null,
    }),
    [ethLayers, alchemixApyPct, safeIndicators, market?.fearGreed, marketScore, borrowRates?.arbitrumRouting, borrowRates?.alchemixRouting],
  );

  const solLayerPlan = useMemo(
    () => buildSolLayerPlanState({
      layers: solLayers ?? [],
      kaminoRouting: borrowRates?.kaminoRouting ?? null,
    }),
    [solLayers, borrowRates?.kaminoRouting],
  );

  const ethEffectiveLayers = ethLayerPlan.effectiveLayers;
  const ethTacticalLayer = (ethEffectiveLayers ?? []).find(layer => layer?.id?.includes('tactical'));
  const solTacticalLayer = (solLayers ?? []).find(layer => layer?.id?.includes('tactical'));

  const deployREth = tacticalCollateralQty(ethCapitalFunnel.workingCapitalQty, ethTacticalLayer);
  const deployMSol = tacticalCollateralQty(solCapitalFunnel.workingCapitalQty, solTacticalLayer);
  const ethBorrowUsdc = tacticalBorrowUsdc(deployREth, ethPrice, targetLtvPct);
  const solBorrowUsdc = tacticalBorrowUsdc(deployMSol, solPrice, targetLtvPct);
  const combinedBorrowUsdc = ethBorrowUsdc + solBorrowUsdc;
  const projectedLbtcQty = computeProjectedLbtcQty(combinedBorrowUsdc, btcPrice);
  const projectedLbtcUsd = projectedLbtcQty * btcPrice;

  const ethTacticalPlanKey = ethTacticalLayer ? planKeyForLayer(ethTacticalLayer.id) : '';
  const ethLbtcPlanKey = ethTacticalPlanKey ? `${ethTacticalPlanKey}-lbtc` : '';
  const isLbtcSupplied = ethTacticalPlanKey
    ? isExecutionConfirmed(ethTacticalPlanKey) || (ethLbtcPlanKey ? isExecutionConfirmed(ethLbtcPlanKey) : false)
    : false;
  const lbtcQtyHeld = portfolioData.lbtc?.qty ?? 0;
  const lbtcUsdHeld = portfolioData.lbtc?.usd ?? 0;
  const totalLbtcApy = computeTotalLbtcApy(isLbtcSupplied, terminalApys?.lbtcSupply ?? 0);
  const netYield = computeNetYield(totalLbtcApy, terminalApys?.usdcBorrow ?? 0);
  const lbtcYieldText = formatLbtcYieldLabel(isLbtcSupplied, terminalApys?.lbtcSupply ?? 0, sk) || '';

  const marketState = useMemo(() => {
    try {
      if (!market?.ready) return null;
      const fg = market.fearGreed ?? NEUTRAL_FG;
      const rsi = market.btcRsi ?? NEUTRAL_RSI;
      return resolveCyborgState(fg, rsi, netYield ?? 0, ltvMax);
    } catch {
      return null;
    }
  }, [market, netYield, ltvMax]);

  const usingNeutralSignals = market?.ready && (market.fearGreed === null || market.btcRsi === null);

  const buildDecisionMeta = useCallback((): DecisionConfirmMeta => {
    return {
      marketConditions: {
        fearGreed: market?.fearGreed ?? null,
        btcRsi: market?.btcRsi ?? null,
        volatilityRegime: safeIndicators.volatilityRegime,
        borrowApyPct: safeIndicators.borrowApyPct ?? 0,
        targetLtvPct: safeIndicators.targetLtvPct ?? 30,
        temperamentPct,
        portfolioUsd,
        netYieldPct: netYield ?? 0,
      },
    };
  }, [market?.fearGreed, market?.btcRsi, safeIndicators, temperamentPct, portfolioUsd, netYield]);

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
          APY: <span className="text-foreground font-mono tabular-nums">{market?.fetchedAt ? formatTimeSafe(market.fetchedAt) : '—'}</span>
        </span>
        {market?.fearGreed != null && <span>F&G: <strong className="text-foreground">{market.fearGreed}</strong></span>}
        {market?.btcRsi != null && <span>RSI: <strong className="text-foreground">{market.btcRsi}</strong></span>}
        {market?.ready && (
          <span>
            Net: <strong className={netYield < 0 ? 'text-red-400' : 'text-emerald-400'}>{netYield.toFixed(2)}%</strong>
          </span>
        )}
      </div>

      {(unavailable ?? []).length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {(unavailable ?? []).map(src => (
            <span key={src} className="inline-flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[10px] text-amber-200">
              <AlertTriangle className="w-3 h-3 shrink-0" />
              {src}: {DATA_UNAVAILABLE}
            </span>
          ))}
        </div>
      )}

      {win?.phase === 'overheated' && (
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
              : rebalanceLockMessage(lang, safeRebalance)}
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

      <div className="grid grid-cols-2 gap-2 min-w-0">
        <div className="rounded-lg border border-violet-500/25 bg-violet-500/5 p-2.5">
          <p className="text-[9px] text-muted-foreground uppercase tracking-wide">ETH</p>
          <p className="font-mono text-sm font-bold text-foreground tabular-nums">
            {(ethTotalQty ?? 0).toFixed(4)} · {formatUsd(portfolioData?.ethBaseline?.totalUsd ?? ethTotalQty * ethPrice)}
          </p>
        </div>
        <div className="rounded-lg border border-violet-500/25 bg-violet-500/5 p-2.5">
          <p className="text-[9px] text-muted-foreground uppercase tracking-wide">SOL</p>
          <p className="font-mono text-sm font-bold text-foreground tabular-nums">
            {(solTotalQty ?? 0).toFixed(2)} · {formatUsd(portfolioData?.solBaseline?.totalUsd ?? solTotalQty * solPrice)}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 min-w-0">
        {[
          { l: sk ? 'Volatilita' : 'Volatility', v: `${fmtNum(safeIndicators.volatilityPct)}%`, sub: safeIndicators.volatilityRegime ?? 'normal', loading: false },
          { l: sk ? 'Cieľové LTV' : 'Target LTV', v: `${safeIndicators.targetLtvPct ?? 30}%`, sub: `max ${ltvMax}%`, loading: false },
          { l: 'USDC Borrow', v: borrowLoading ? '…' : ((borrowRates?.unavailable?.length ?? 0) === 2 ? '0%' : `${fmtNum(safeIndicators.borrowApyPct, 2)}%`), sub: borrowLoading ? (sk ? 'načítavam' : 'loading') : (safeIndicators.borrowWarning ? 'warn' : ((borrowRates?.unavailable?.length ?? 0) > 0 ? 'partial' : 'live')), loading: borrowLoading },
          { l: sk ? 'Gas vrstva' : 'Gas layer', v: `${fmtNum(safeIndicators.gasLayerPct)}%`, sub: safeIndicators.gasStress ?? 'normal', loading: false },
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

      {(borrowRates?.unavailable?.length ?? 0) > 0 && (
        <p className="text-[10px] text-amber-400/90">
          {sk
            ? `Borrow zdroje nedostupné (${borrowRates?.unavailable?.join(', ') ?? ''}). Zobrazené 0 % do načítania live dát.`
            : `Borrow sources unavailable (${borrowRates?.unavailable?.join(', ') ?? ''}). Showing 0% until live data loads.`}
        </p>
      )}

      {safeIndicators.borrowWarning && (
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

      {ltvRestricted && !safeIndicators.borrowWarning && (
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
        price={ethPrice}
        layers={ethEffectiveLayers ?? []}
        rebalanceLocked={rebalanceLocked}
        ltvMax={ltvMax}
        ltvRestricted={ltvRestricted}
        showBorrowFlow
        combinedBorrowUsdc={combinedBorrowUsdc}
        projectedLbtcQty={projectedLbtcQty}
        projectedLbtcUsd={projectedLbtcUsd}
        terminalApys={terminalApysSafe}
        lbtcYieldText={lbtcYieldText}
        usdcDebt={cyborgUsdcDebt ?? 0}
        indicators={safeIndicators}
        stakedEntries={ethStakedEntries ?? []}
        alchemixApyPct={alchemixApyPct}
        buildDecisionMeta={buildDecisionMeta}
        arbitrumWinner={ethLayerPlan.arbitrumWinner}
        alchemixLocked={ethLayerPlan.alchemixLocked}
        targetLtvPct={targetLtvPct}
        arbitrumRouting={ethLayerPlan.arbitrumRouting}
        alchemixWinner={ethLayerPlan.alchemixWinner}
        temperamentPct={temperamentPct}
        usdcBalance={usdcBalance}
        profitUsd={ethProfitUsd}
        btcPrice={btcPrice}
        maxLtvPct={ltvMax}
        lbtcQtyHeld={lbtcQtyHeld}
        lbtcUsdHeld={lbtcUsdHeld}
      />

      <AssetHcdCard
        symbol="SOL"
        lang={lang}
        totalPortfolioQty={solTotalQty}
        price={solPrice}
        layers={solLayerPlan.layers ?? []}
        rebalanceLocked={rebalanceLocked}
        ltvMax={ltvMax}
        ltvRestricted={ltvRestricted}
        showBorrowFlow={false}
        combinedBorrowUsdc={combinedBorrowUsdc}
        projectedLbtcQty={projectedLbtcQty}
        projectedLbtcUsd={projectedLbtcUsd}
        terminalApys={terminalApysSafe}
        lbtcYieldText={lbtcYieldText}
        usdcDebt={cyborgUsdcDebt ?? 0}
        indicators={safeIndicators}
        stakedEntries={solStakedEntries ?? []}
        alchemixApyPct={alchemixApyPct}
        buildDecisionMeta={buildDecisionMeta}
        kaminoWinner={solLayerPlan.kaminoWinner}
        kaminoRouting={solLayerPlan.kaminoRouting}
        targetLtvPct={targetLtvPct}
        temperamentPct={temperamentPct}
        usdcBalance={usdcBalance}
        profitUsd={solProfitUsd}
        btcPrice={btcPrice}
        maxLtvPct={ltvMax}
        lbtcQtyHeld={0}
        lbtcUsdHeld={0}
      />

      <p className="text-[10px] text-muted-foreground leading-snug">
        {sk
          ? 'HCD mozog riadi indikátory a limity LTV. Exekúcia (presné príkazy, borrow, Alchemix) je priamo vo Vrstve 3 a 4. Rebalans len v kvartálnych mesiacoch.'
          : 'HCD brain drives indicators and LTV limits. Execution (exact commands, borrow, Alchemix) lives in Layers 3 and 4. Rebalance only in quarterly months.'}
      </p>
    </div>
  );
}
