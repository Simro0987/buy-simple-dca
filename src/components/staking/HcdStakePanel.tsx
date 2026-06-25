import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  AlertTriangle, Bot, ChevronDown, ClipboardCopy, Layers, Loader2, Lock, RefreshCw, Shield, Unlock, Zap,
} from 'lucide-react';
import { toast } from 'sonner';
import { Lang } from '@/lib/i18n';
import { formatUsd } from '@/lib/crypto';
import { usePortfolio, type PortfolioBalanceUpdate } from '@/contexts/PortfolioContext';
import { useStakingSplitApys } from '@/contexts/StakingApyContext';
import { useHcdIndicators } from '@/hooks/useHcdIndicators';
import { useCyborgMarketData } from '@/hooks/useCyborgTerminalData';
import { GranularExecutionButtons } from '@/components/staking/GranularExecutionButtons';
import { Slider } from '@/components/ui/slider';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import {
  computeHcdLayerTargets,
  getHcdLtvMax,
  rebalanceLockMessage,
  type HcdIndicators,
  type HcdLayerTarget,
  type HcdSymbol,
} from '@/lib/hcdArchitecture';
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
  computeUsdcLoan,
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

const EXEC_KEYS = {
  rEth: 'motor-reth',
  mSol: 'motor-msol',
  alchemixEth: 'hcd-alchemix-eth',
  lbtcSupply: 'lbtc-supply',
  usdcBorrow: 'usdc-borrow',
} as const;

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

function SliderBlock({
  label, value, onChange, hint, danger, disabled, max = 100,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  hint: string;
  danger?: boolean;
  disabled?: boolean;
  max?: number;
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
        value={[Math.min(value, max)]}
        min={0}
        max={max}
        step={1}
        disabled={disabled}
        onValueChange={([v]) => onChange(v)}
        className={`py-2 touch-manipulation [&_[role=slider]]:h-6 [&_[role=slider]]:w-6 ${
          danger ? '[&_[role=slider]]:border-amber-500 [&_[role=slider]]:bg-amber-500/30' : ''
        }`}
      />
      <p className={`text-[10px] ${danger ? 'text-amber-400' : 'text-muted-foreground'}`}>{hint}</p>
    </div>
  );
}

function BalanceRow({
  icon, label, sublabel, qty, usd, decimals, lang, confirmed, onConfirm, onRevert, disabled,
}: {
  icon: ReactNode;
  label: string;
  sublabel: string;
  qty: number;
  usd: number;
  decimals: number;
  lang: Lang;
  confirmed: boolean;
  onConfirm: () => void;
  onRevert: () => void;
  disabled?: boolean;
}) {
  return (
    <div
      className={`rounded-xl border p-2.5 space-y-1.5 ${
        confirmed ? 'border-border/30 bg-muted/20 opacity-70' : 'border-border/50 bg-background/30'
      }`}
    >
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
      <div className="flex items-center gap-2">
        <p className="text-sm font-mono tabular-nums text-foreground flex-1">
          {qty.toFixed(decimals)} {label}
        </p>
        <GranularExecutionButtons
          lang={lang}
          value={qty}
          decimals={decimals}
          confirmed={confirmed}
          disabled={disabled || qty <= 0}
          onConfirm={onConfirm}
          onRevert={onRevert}
        />
      </div>
    </div>
  );
}

function TacticalLayerExecution({
  symbol,
  lang,
  layer,
  collateralPct,
  onCollateralChange,
  ltvPct,
  onLtvChange,
  ltvMax,
  ltvRestricted,
  motorQty,
  motorUsd,
  deployQty,
  deployUsd,
  price,
  rebalanceLocked,
  showBorrowFlow,
  usdcLoan,
  projectedLbtcQty,
  projectedLbtcUsd,
  terminalApys,
  isLbtcSupplied,
  lbtcYieldText,
  onConfirmMotor,
  onRevertMotor,
  motorConfirmed,
  onConfirmUsdc,
  onRevertUsdc,
  onConfirmLbtc,
  onRevertLbtc,
  usdcConfirmed,
  lbtcConfirmed,
}: {
  symbol: HcdSymbol;
  lang: Lang;
  layer: HcdLayerTarget;
  collateralPct: number;
  onCollateralChange: (v: number) => void;
  ltvPct: number;
  onLtvChange: (v: number) => void;
  ltvMax: number;
  ltvRestricted: boolean;
  motorQty: number;
  motorUsd: number;
  deployQty: number;
  deployUsd: number;
  price: number;
  rebalanceLocked: boolean;
  showBorrowFlow: boolean;
  usdcLoan: number;
  projectedLbtcQty: number;
  projectedLbtcUsd: number;
  terminalApys: { usdcBorrow: number; lbtcSupply: number };
  isLbtcSupplied: boolean;
  lbtcYieldText: string;
  onConfirmMotor: () => void;
  onRevertMotor: () => void;
  motorConfirmed: boolean;
  onConfirmUsdc: () => void;
  onRevertUsdc: () => void;
  onConfirmLbtc: () => void;
  onRevertLbtc: () => void;
  usdcConfirmed: boolean;
  lbtcConfirmed: boolean;
}) {
  const sk = lang === 'sk';
  const decimals = symbol === 'SOL' ? 2 : 4;
  const motorLabel = symbol === 'ETH' ? 'rETH' : 'mSOL';
  const execDisabled = rebalanceLocked || motorUsd <= 0;

  return (
    <Collapsible defaultOpen className="rounded-xl border border-violet-500/30 bg-violet-500/5">
      <CollapsibleTrigger className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left hover:bg-violet-500/5 transition-colors">
        <span className="text-[11px] font-semibold text-violet-200">
          {sk ? 'Exekúcia · Taktický motor' : 'Execution · Tactical motor'}
        </span>
        <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0 transition-transform [[data-state=open]_&]:rotate-180" />
      </CollapsibleTrigger>
      <CollapsibleContent className="px-3 pb-3 space-y-3">
        <BalanceRow
          icon={<Shield className="w-3.5 h-3.5 text-violet-300" />}
          label={motorLabel}
          sublabel={layer.protocol}
          qty={deployQty}
          usd={deployUsd}
          decimals={decimals}
          lang={lang}
          confirmed={motorConfirmed}
          disabled={execDisabled}
          onConfirm={onConfirmMotor}
          onRevert={onRevertMotor}
        />

        <div className="rounded-xl border border-border/50 bg-background/40 p-3 space-y-4">
          <SliderBlock
            label={sk ? 'Nasadenie kolaterálu %' : 'Collateral Deployment %'}
            value={collateralPct}
            onChange={onCollateralChange}
            hint={`${collateralPct}% · ${formatUsd(motorUsd * (collateralPct / 100))}`}
            disabled={execDisabled}
          />
          <SliderBlock
            label={sk ? 'Cieľové LTV %' : 'Target LTV %'}
            value={ltvPct}
            onChange={onLtvChange}
            max={ltvMax}
            danger={ltvRestricted}
            hint={
              ltvRestricted
                ? (sk
                  ? `⚠ HCD mozog limituje max LTV na ${ltvMax}%`
                  : `⚠ HCD brain caps max LTV at ${ltvMax}%`)
                : `${ltvPct}% · max ${ltvMax}%`
            }
            disabled={execDisabled}
          />
        </div>

        {showBorrowFlow && (
          <>
            <div
              className={`flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between rounded-lg border px-3 py-2 ${
                usdcConfirmed
                  ? 'bg-muted/30 border-border/40 opacity-70'
                  : 'bg-emerald-500/10 border-emerald-500/25'
              }`}
            >
              <span className="text-[11px] text-muted-foreground">
                {sk ? 'Vypočítaný USDC loan (ETH+SOL)' : 'Calculated USDC loan (ETH+SOL)'}
              </span>
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-emerald-300 tabular-nums">
                  {formatUsd(usdcLoan)}
                </span>
                <GranularExecutionButtons
                  lang={lang}
                  value={usdcLoan}
                  decimals={2}
                  confirmed={usdcConfirmed}
                  disabled={execDisabled || usdcLoan <= 0}
                  onConfirm={onConfirmUsdc}
                  onRevert={onRevertUsdc}
                />
              </div>
            </div>

            <div
              className={`rounded-lg border px-3 py-2 space-y-1.5 ${
                lbtcConfirmed
                  ? 'border-emerald-500/40 bg-emerald-500/5 opacity-80'
                  : 'border-border/40 bg-background/30'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold text-foreground">LBTC Projected Buy</p>
                  <p className="text-[9px] text-muted-foreground">
                    {sk ? 'USDC loan ÷ BTC cena' : 'USDC loan ÷ BTC price'}
                  </p>
                </div>
                <GranularExecutionButtons
                  lang={lang}
                  value={projectedLbtcQty}
                  decimals={6}
                  confirmed={lbtcConfirmed}
                  disabled={execDisabled || projectedLbtcQty <= 0}
                  onConfirm={onConfirmLbtc}
                  onRevert={onRevertLbtc}
                />
              </div>
              <div className="flex items-center justify-between text-[11px]">
                <span className="font-mono tabular-nums text-foreground">
                  {projectedLbtcQty.toFixed(6)} LBTC
                </span>
                <span className="text-muted-foreground tabular-nums">{formatUsd(projectedLbtcUsd)}</span>
              </div>
            </div>

            <p className="text-[10px] text-muted-foreground leading-snug" title={lbtcYieldText}>
              Morpho borrow: {apyLabel(terminalApys.usdcBorrow)} · {lbtcYieldText}
            </p>
          </>
        )}

        <p className="text-[9px] text-muted-foreground font-mono tabular-nums">
          {motorQty.toFixed(decimals)} {motorLabel} · {formatUsd(motorUsd)} @ {formatUsd(price)}
        </p>
      </CollapsibleContent>
    </Collapsible>
  );
}

function AlchemixLayerExecution({
  lang,
  layer,
  alchemixQty,
  alchemixUsd,
  alchemixTotalUsd,
  rebalanceLocked,
  confirmed,
  onConfirm,
  onRevert,
}: {
  lang: Lang;
  layer: HcdLayerTarget;
  alchemixQty: number;
  alchemixUsd: number;
  alchemixTotalUsd: number;
  rebalanceLocked: boolean;
  confirmed: boolean;
  onConfirm: () => void;
  onRevert: () => void;
}) {
  const sk = lang === 'sk';

  return (
    <Collapsible defaultOpen className="rounded-xl border border-sky-500/30 bg-sky-500/5">
      <CollapsibleTrigger className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left hover:bg-sky-500/5 transition-colors">
        <span className="text-[11px] font-semibold text-sky-200">
          {sk ? 'Exekúcia · Alchemix Vault' : 'Execution · Alchemix Vault'}
        </span>
        <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0 transition-transform [[data-state=open]_&]:rotate-180" />
      </CollapsibleTrigger>
      <CollapsibleContent className="px-3 pb-3 space-y-2">
        <BalanceRow
          icon={<Lock className="w-3.5 h-3.5 text-sky-300" />}
          label="ETH"
          sublabel={sk ? `${layer.protocol} · Bez likvidácie` : `${layer.protocol} · No liquidation`}
          qty={alchemixQty}
          usd={alchemixUsd}
          decimals={4}
          lang={lang}
          confirmed={confirmed}
          disabled={rebalanceLocked}
          onConfirm={onConfirm}
          onRevert={onRevert}
        />
        <p className="text-[10px] text-muted-foreground">
          {sk ? 'Alchemix celkom' : 'Alchemix total'}:{' '}
          <span className="text-foreground font-semibold tabular-nums">{formatUsd(alchemixTotalUsd)}</span>
        </p>
      </CollapsibleContent>
    </Collapsible>
  );
}

function AssetHcdCard({
  symbol,
  lang,
  liquidQty,
  price,
  layers,
  rebalanceLocked,
  advised,
  indicators,
  ltvMax,
  ltvRestricted,
  ethCollateralPct,
  solCollateralPct,
  onEthCollateralChange,
  onSolCollateralChange,
  ltvPct,
  onLtvChange,
  motorData,
  showBorrowFlow,
  usdcLoan,
  projectedLbtcQty,
  projectedLbtcUsd,
  terminalApys,
  isLbtcSupplied,
  lbtcYieldText,
  alchemixData,
  onConfirmMotor,
  onRevertMotor,
  motorConfirmed,
  onConfirmUsdc,
  onRevertUsdc,
  onConfirmLbtc,
  onRevertLbtc,
  usdcConfirmed,
  lbtcConfirmed,
  onConfirmAlchemix,
  onRevertAlchemix,
  alchemixConfirmed,
}: {
  symbol: HcdSymbol;
  lang: Lang;
  liquidQty: number;
  price: number;
  layers: HcdLayerTarget[];
  rebalanceLocked: boolean;
  advised: AdvisorResult | null;
  indicators: HcdIndicators;
  ltvMax: number;
  ltvRestricted: boolean;
  ethCollateralPct: number;
  solCollateralPct: number;
  onEthCollateralChange: (v: number) => void;
  onSolCollateralChange: (v: number) => void;
  ltvPct: number;
  onLtvChange: (v: number) => void;
  motorData: { qty: number; usd: number; deployQty: number; deployUsd: number };
  showBorrowFlow: boolean;
  usdcLoan: number;
  projectedLbtcQty: number;
  projectedLbtcUsd: number;
  terminalApys: { usdcBorrow: number; lbtcSupply: number };
  isLbtcSupplied: boolean;
  lbtcYieldText: string;
  alchemixData?: { qty: number; usd: number; totalUsd: number };
  onConfirmMotor: () => void;
  onRevertMotor: () => void;
  motorConfirmed: boolean;
  onConfirmUsdc: () => void;
  onRevertUsdc: () => void;
  onConfirmLbtc: () => void;
  onRevertLbtc: () => void;
  usdcConfirmed: boolean;
  lbtcConfirmed: boolean;
  onConfirmAlchemix?: () => void;
  onRevertAlchemix?: () => void;
  alchemixConfirmed?: boolean;
}) {
  const sk = lang === 'sk';
  const { confirmExecutionStep, revertExecutionStep, isExecutionConfirmed } = usePortfolio();
  const apys = useStakingSplitApys();
  const decimals = symbol === 'SOL' ? 2 : 3;
  const totalUsd = liquidQty * price;
  const deployQty = advised?.breakdown.recommendedQty ?? liquidQty;
  const collateralPct = symbol === 'ETH' ? ethCollateralPct : solCollateralPct;
  const onCollateralChange = symbol === 'ETH' ? onEthCollateralChange : onSolCollateralChange;

  return (
    <div className="glass-card p-3 sm:p-4 space-y-3 border border-violet-500/25 min-w-0">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between min-w-0">
        <div className="flex items-center gap-2 min-w-0">
          <Layers className="w-4 h-4 text-violet-300 shrink-0" />
          <h3 className="text-sm font-bold text-foreground">{symbol} · HCD Vrstvy</h3>
        </div>
        <p className="text-[10px] text-muted-foreground font-mono tabular-nums">
          {liquidQty.toFixed(decimals)} {symbol} · {formatUsd(totalUsd)}
        </p>
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
                  collateralPct={collateralPct}
                  onCollateralChange={onCollateralChange}
                  ltvPct={ltvPct}
                  onLtvChange={onLtvChange}
                  ltvMax={ltvMax}
                  ltvRestricted={ltvRestricted}
                  motorQty={motorData.qty}
                  motorUsd={motorData.usd}
                  deployQty={motorData.deployQty}
                  deployUsd={motorData.deployUsd}
                  price={price}
                  rebalanceLocked={rebalanceLocked}
                  showBorrowFlow={showBorrowFlow}
                  usdcLoan={usdcLoan}
                  projectedLbtcQty={projectedLbtcQty}
                  projectedLbtcUsd={projectedLbtcUsd}
                  terminalApys={terminalApys}
                  isLbtcSupplied={isLbtcSupplied}
                  lbtcYieldText={lbtcYieldText}
                  onConfirmMotor={onConfirmMotor}
                  onRevertMotor={onRevertMotor}
                  motorConfirmed={motorConfirmed}
                  onConfirmUsdc={onConfirmUsdc}
                  onRevertUsdc={onRevertUsdc}
                  onConfirmLbtc={onConfirmLbtc}
                  onRevertLbtc={onRevertLbtc}
                  usdcConfirmed={usdcConfirmed}
                  lbtcConfirmed={lbtcConfirmed}
                />
              )}

              {isAlchemix && alchemixData && onConfirmAlchemix && onRevertAlchemix && (
                <AlchemixLayerExecution
                  lang={lang}
                  layer={layer}
                  alchemixQty={alchemixData.qty}
                  alchemixUsd={alchemixData.usd}
                  alchemixTotalUsd={alchemixData.totalUsd}
                  rebalanceLocked={rebalanceLocked}
                  confirmed={alchemixConfirmed ?? false}
                  onConfirm={onConfirmAlchemix}
                  onRevert={onRevertAlchemix}
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
  const { portfolioData, confirmExecutionStep, revertExecutionStep, isExecutionConfirmed } = usePortfolio();
  const { entries } = useStakingLedger();
  const { indicators, rebalance, borrowLoading } = useHcdIndicators(lang);
  const { market, marketLoading, updating, refresh, unavailable, terminalApys } = useCyborgMarketData();
  const win = getTimingWindow(marketScore);
  const [isEmergencyUnlocked, setIsEmergencyUnlocked] = useState(false);
  const rebalanceLocked = (!rebalance.unlocked || win.locked) && !isEmergencyUnlocked;
  const ltvMax = getHcdLtvMax(indicators);
  const ltvRestricted = indicators.volatilityRegime === 'high' || indicators.borrowWarning;

  const [ethCollateralPct, setEthCollateralPct] = useState(50);
  const [solCollateralPct, setSolCollateralPct] = useState(50);
  const [ltvPct, setLtvPct] = useState(indicators.targetLtvPct);
  const [slidersTouched, setSlidersTouched] = useState(false);

  const ethSlice = portfolioData.assets?.ETH ?? EMPTY_SLICE;
  const solSlice = portfolioData.assets?.SOL ?? EMPTY_SLICE;
  const { rEth, mSol } = portfolioData.activeMotor ?? { rEth: { qty: 0, usd: 0 }, mSol: { qty: 0, usd: 0 } };
  const alchemixReserve = portfolioData.alchemixReserve ?? { eth: { qty: 0, usd: 0 } };
  const ethPrice = portfolioData.prices?.eth ?? 0;
  const solPrice = portfolioData.prices?.sol ?? 0;
  const btcPrice = portfolioData.prices?.btc ?? 0;

  const deployREth = (rEth.qty ?? 0) * (ethCollateralPct / 100);
  const deployMSol = (mSol.qty ?? 0) * (solCollateralPct / 100);
  const ethMotorUsd = (rEth.qty ?? 0) * ethPrice;
  const solMotorUsd = (mSol.qty ?? 0) * solPrice;
  const motorUsd = ethMotorUsd + solMotorUsd;
  const avgCollateralPct = motorUsd > 0
    ? ((ethMotorUsd * ethCollateralPct + solMotorUsd * solCollateralPct) / motorUsd)
    : 50;
  const usdcLoan = computeUsdcLoan(rEth.qty ?? 0, mSol.qty ?? 0, ethPrice, solPrice, avgCollateralPct, ltvPct);
  const projectedLbtcQty = computeProjectedLbtcQty(usdcLoan, btcPrice);
  const projectedLbtcUsd = projectedLbtcQty * btcPrice;

  const isLbtcSupplied = isExecutionConfirmed(EXEC_KEYS.lbtcSupply);
  const totalLbtcApy = computeTotalLbtcApy(isLbtcSupplied, terminalApys?.lbtcSupply ?? 0);
  const netYield = computeNetYield(totalLbtcApy, terminalApys?.usdcBorrow ?? 0);
  const lbtcYieldText = formatLbtcYieldLabel(isLbtcSupplied, terminalApys?.lbtcSupply ?? 0, sk);

  const marketState = useMemo(() => {
    if (!market?.ready) return null;
    const fg = market.fearGreed ?? NEUTRAL_FG;
    const rsi = market.btcRsi ?? NEUTRAL_RSI;
    return resolveCyborgState(fg, rsi, netYield, ltvPct);
  }, [market, netYield, ltvPct]);

  const usingNeutralSignals = market?.ready && (market.fearGreed === null || market.btcRsi === null);

  useEffect(() => {
    if (!marketState || slidersTouched) return;
    setEthCollateralPct(marketState.sliders.collateralPct);
    setSolCollateralPct(marketState.sliders.collateralPct);
    setLtvPct(Math.min(marketState.sliders.ltvPct, ltvMax));
  }, [marketState?.state, marketState?.sliders.collateralPct, marketState?.sliders.ltvPct, slidersTouched, ltvMax]);

  useEffect(() => {
    if (slidersTouched) return;
    setLtvPct(Math.min(indicators.targetLtvPct, ltvMax));
  }, [indicators.targetLtvPct, slidersTouched, ltvMax]);

  useEffect(() => {
    setLtvPct(prev => Math.min(prev, ltvMax));
  }, [ltvMax]);

  useEffect(() => {
    if (!market) return;
    setSlidersTouched(false);
  }, [market?.fetchedAt]);

  const ethLayers = useMemo(() => computeHcdLayerTargets('ETH', indicators) ?? [], [indicators]);
  const solLayers = useMemo(() => computeHcdLayerTargets('SOL', indicators) ?? [], [indicators]);

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

  const confirmRow = useCallback((
    key: string,
    update: Parameters<typeof confirmExecutionStep>[1],
    successMsg?: string,
  ) => {
    confirmExecutionStep(key, update);
    toast.success(successMsg ?? (sk ? 'Portfólio aktualizované!' : 'Portfolio updated!'));
  }, [confirmExecutionStep, sk]);

  const revertRow = useCallback((key: string) => {
    revertExecutionStep(key);
    toast.success(sk ? 'Akcia vrátená späť' : 'Action reverted');
  }, [revertExecutionStep, sk]);

  const copyPlan = useCallback(async () => {
    const action = marketState?.action ?? 'HOLD';
    const actionText = sk ? ACTION_LABEL[action].sk : ACTION_LABEL[action].en;
    const stateText = marketStateLabel(marketState?.state, market?.fearGreed ?? null, sk);
    const plan = [
      '--- HCD CYBORG MATRIX ---',
      `Market State: ${stateText}`,
      `Action: ${actionText}`,
      `ETH Deploy: ${ethCollateralPct}% · ${deployREth.toFixed(4)} rETH`,
      `SOL Deploy: ${solCollateralPct}% · ${deployMSol.toFixed(2)} mSOL`,
      `Target LTV: ${ltvPct}% (max ${ltvMax}%)`,
      `Borrow: $${usdcLoan.toFixed(2)} USDC`,
      `Buy: ${projectedLbtcQty.toFixed(6)} LBTC (projected)`,
    ].join('\n');
    try {
      await navigator.clipboard.writeText(plan);
      toast.success(sk ? 'Plán skopírovaný do schránky' : 'Plan copied to clipboard');
    } catch {
      toast.error(sk ? 'Kopírovanie zlyhalo' : 'Copy failed');
    }
  }, [sk, marketState, market?.fearGreed, ethCollateralPct, solCollateralPct, deployREth, deployMSol, ltvPct, ltvMax, usdcLoan, projectedLbtcQty]);

  const handleLtvChange = useCallback((v: number) => {
    setSlidersTouched(true);
    setLtvPct(Math.min(v, ltvMax));
  }, [ltvMax]);

  if (portfolioData.loading) {
    return (
      <div className="glass-card p-3 text-sm text-muted-foreground flex items-center gap-2">
        <Loader2 className="w-4 h-4 animate-spin" />
        {sk ? 'Načítavam HCD Cyborg Matrix…' : 'Loading HCD Cyborg Matrix…'}
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
            disabled={motorUsd <= 0}
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
          { l: 'USDC Borrow', v: `${fmtNum(indicators.borrowApyPct, 2)}%`, sub: indicators.borrowWarning ? 'warn' : 'live', loading: borrowLoading },
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

      {indicators.borrowWarning && (
        <div className="rounded-xl border border-red-500/50 bg-red-500/10 p-3 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
          <div className="text-[11px] text-red-200 leading-snug">
            <p className="font-bold">{sk ? 'VAROVANIE: Net Borrow Cost > 8%' : 'WARNING: Net Borrow Cost > 8%'}</p>
            <p className="mt-1 text-red-200/80">
              {sk
                ? 'Úrok na Aave/Kamino je príliš vysoký. Zníž taktický kolaterál a splať USDC dlh. LTV slider je limitovaný na 20%.'
                : 'Aave/Kamino borrow rate is too high. Reduce tactical collateral and repay USDC debt. LTV slider capped at 20%.'}
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
        liquidQty={ethSlice.liquidQty ?? 0}
        price={ethSlice.currentPrice ?? 0}
        layers={ethLayers}
        rebalanceLocked={rebalanceLocked}
        advised={ethAdvice.eligible ? ethAdvice : null}
        indicators={indicators}
        ltvMax={ltvMax}
        ltvRestricted={ltvRestricted}
        ethCollateralPct={ethCollateralPct}
        solCollateralPct={solCollateralPct}
        onEthCollateralChange={v => { setSlidersTouched(true); setEthCollateralPct(v); }}
        onSolCollateralChange={v => { setSlidersTouched(true); setSolCollateralPct(v); }}
        ltvPct={ltvPct}
        onLtvChange={handleLtvChange}
        motorData={{ qty: rEth.qty ?? 0, usd: ethMotorUsd, deployQty: deployREth, deployUsd: deployREth * ethPrice }}
        showBorrowFlow
        usdcLoan={usdcLoan}
        projectedLbtcQty={projectedLbtcQty}
        projectedLbtcUsd={projectedLbtcUsd}
        terminalApys={terminalApysSafe}
        isLbtcSupplied={isLbtcSupplied}
        lbtcYieldText={lbtcYieldText}
        alchemixData={{
          qty: alchemixReserve.eth.qty ?? 0,
          usd: alchemixReserve.eth.usd ?? 0,
          totalUsd: portfolioData.totalAlchemixUsd ?? 0,
        }}
        onConfirmMotor={() => confirmRow(EXEC_KEYS.rEth, { rEthQty: deployREth })}
        onRevertMotor={() => revertRow(EXEC_KEYS.rEth)}
        motorConfirmed={isExecutionConfirmed(EXEC_KEYS.rEth)}
        onConfirmUsdc={() => confirmRow(EXEC_KEYS.usdcBorrow, { usdcBorrowed: usdcLoan })}
        onRevertUsdc={() => revertRow(EXEC_KEYS.usdcBorrow)}
        usdcConfirmed={isExecutionConfirmed(EXEC_KEYS.usdcBorrow)}
        onConfirmLbtc={() => confirmRow(
          EXEC_KEYS.lbtcSupply,
          { lbtcQty: projectedLbtcQty },
          sk ? 'LBTC supply potvrdené' : 'LBTC supply confirmed',
        )}
        onRevertLbtc={() => revertRow(EXEC_KEYS.lbtcSupply)}
        lbtcConfirmed={isLbtcSupplied}
        onConfirmAlchemix={() => confirmRow(EXEC_KEYS.alchemixEth, { alchemixEthQty: alchemixReserve.eth.qty ?? 0 })}
        onRevertAlchemix={() => revertRow(EXEC_KEYS.alchemixEth)}
        alchemixConfirmed={isExecutionConfirmed(EXEC_KEYS.alchemixEth)}
      />

      <AssetHcdCard
        symbol="SOL"
        lang={lang}
        liquidQty={solSlice.liquidQty ?? 0}
        price={solSlice.currentPrice ?? 0}
        layers={solLayers}
        rebalanceLocked={rebalanceLocked}
        advised={solAdvice.eligible ? solAdvice : null}
        indicators={indicators}
        ltvMax={ltvMax}
        ltvRestricted={ltvRestricted}
        ethCollateralPct={ethCollateralPct}
        solCollateralPct={solCollateralPct}
        onEthCollateralChange={v => { setSlidersTouched(true); setEthCollateralPct(v); }}
        onSolCollateralChange={v => { setSlidersTouched(true); setSolCollateralPct(v); }}
        ltvPct={ltvPct}
        onLtvChange={handleLtvChange}
        motorData={{ qty: mSol.qty ?? 0, usd: solMotorUsd, deployQty: deployMSol, deployUsd: deployMSol * solPrice }}
        showBorrowFlow={false}
        usdcLoan={usdcLoan}
        projectedLbtcQty={projectedLbtcQty}
        projectedLbtcUsd={projectedLbtcUsd}
        terminalApys={terminalApysSafe}
        isLbtcSupplied={isLbtcSupplied}
        lbtcYieldText={lbtcYieldText}
        onConfirmMotor={() => confirmRow(EXEC_KEYS.mSol, { mSolQty: deployMSol })}
        onRevertMotor={() => revertRow(EXEC_KEYS.mSol)}
        motorConfirmed={isExecutionConfirmed(EXEC_KEYS.mSol)}
        onConfirmUsdc={() => confirmRow(EXEC_KEYS.usdcBorrow, { usdcBorrowed: usdcLoan })}
        onRevertUsdc={() => revertRow(EXEC_KEYS.usdcBorrow)}
        onConfirmLbtc={() => {}}
        onRevertLbtc={() => {}}
        usdcConfirmed={isExecutionConfirmed(EXEC_KEYS.usdcBorrow)}
        lbtcConfirmed={isLbtcSupplied}
      />

      <p className="text-[10px] text-muted-foreground leading-snug">
        {sk
          ? 'HCD mozog riadi indikátory a limity LTV. Exekúcia (slidery, borrow, Alchemix) je priamo vo Vrstve 3 a 4. Rebalans len v kvartálnych mesiacoch.'
          : 'HCD brain drives indicators and LTV limits. Execution (sliders, borrow, Alchemix) lives in Layers 3 and 4. Rebalance only in quarterly months.'}
      </p>
    </div>
  );
}
