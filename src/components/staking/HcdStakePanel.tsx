import { useMemo } from 'react';
import { AlertTriangle, Layers, Lock, Shield, Zap } from 'lucide-react';
import { toast } from 'sonner';
import { Lang } from '@/lib/i18n';
import { formatUsd } from '@/lib/crypto';
import { usePortfolio, type PortfolioBalanceUpdate } from '@/contexts/PortfolioContext';
import { useStakingSplitApys } from '@/contexts/StakingApyContext';
import { useHcdIndicators } from '@/hooks/useHcdIndicators';
import { GranularExecutionButtons } from '@/components/staking/GranularExecutionButtons';
import {
  computeHcdLayerTargets,
  rebalanceLockMessage,
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

interface Props {
  lang: Lang;
  marketScore: number;
}

function layerApy(layer: HcdLayerTarget, apys: { rEth: number; mSol: number }): string | null {
  if (layer.id.includes('core') && layer.asset === 'rETH') return `${apys.rEth.toFixed(2)}%`;
  if (layer.id.includes('core') && layer.asset === 'mSOL') return `${apys.mSol.toFixed(2)}%`;
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

function AssetHcdCard({
  symbol,
  lang,
  liquidQty,
  price,
  layers,
  rebalanceLocked,
  advised,
}: {
  symbol: HcdSymbol;
  lang: Lang;
  liquidQty: number;
  price: number;
  layers: HcdLayerTarget[];
  rebalanceLocked: boolean;
  advised: AdvisorResult | null;
}) {
  const sk = lang === 'sk';
  const { confirmExecutionStep, revertExecutionStep, isExecutionConfirmed } = usePortfolio();
  const apys = useStakingSplitApys();
  const decimals = symbol === 'SOL' ? 2 : 3;
  const totalUsd = liquidQty * price;
  const deployQty = advised?.breakdown.recommendedQty ?? liquidQty;

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
        {layers.map(layer => {
          const qty = deployQty * (layer.pctTarget / 100);
          const usd = qty * price;
          const stepKey = `hcd-${layer.id}`;
          const confirmed = isExecutionConfirmed(stepKey);
          const apy = layerApy(layer, apys);
          const canExecute = !rebalanceLocked && !!layer.ledgerProtocol && qty > 0;

          return (
            <div
              key={layer.id}
              className={`rounded-xl border p-2.5 sm:p-3 space-y-2 min-w-0 ${
                confirmed ? 'border-border/30 bg-muted/20 opacity-75' : 'border-border/50 bg-background/30'
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

              {layer.ledgerProtocol ? (
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
              ) : (
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
  const { portfolioData } = usePortfolio();
  const { entries } = useStakingLedger();
  const { indicators, rebalance } = useHcdIndicators(lang);
  const win = getTimingWindow(marketScore);
  const rebalanceLocked = !rebalance.unlocked || win.locked;

  const ethLayers = useMemo(
    () => computeHcdLayerTargets('ETH', indicators),
    [indicators],
  );
  const solLayers = useMemo(
    () => computeHcdLayerTargets('SOL', indicators),
    [indicators],
  );

  const ethAdvice = useMemo(() => {
    const slice = portfolioData.assets.ETH;
    return computeAdvice({
      symbol: 'ETH',
      liquidQty: slice.liquidQty,
      pricePerUnit: slice.currentPrice,
      marketScore,
      ledgerEntries: entries,
    });
  }, [portfolioData.assets.ETH, marketScore, entries]);

  const solAdvice = useMemo(() => {
    const slice = portfolioData.assets.SOL;
    return computeAdvice({
      symbol: 'SOL',
      liquidQty: slice.liquidQty,
      pricePerUnit: slice.currentPrice,
      marketScore,
      ledgerEntries: entries,
    });
  }, [portfolioData.assets.SOL, marketScore, entries]);

  if (portfolioData.loading) {
    return (
      <div className="glass-card p-3 text-sm text-muted-foreground">
        {sk ? 'Načítavam HCD staking…' : 'Loading HCD staking…'}
      </div>
    );
  }

  if (win.phase === 'overheated') {
    return (
      <div className="glass-card p-3 border border-loss/40 bg-loss/5">
        <p className="text-[11px] text-loss font-semibold">{overheatedWarning(lang)}</p>
      </div>
    );
  }

  return (
    <div className="space-y-3 min-w-0">
      <div className="flex items-center gap-2">
        <Shield className="w-4 h-4 text-violet-300" />
        <h2 className="text-sm font-bold text-foreground">
          {sk ? 'HCD Staking Architektúra' : 'HCD Staking Architecture'}
        </h2>
      </div>

      <div
        className={`rounded-xl border px-3 py-2.5 flex items-start gap-2 text-[11px] leading-snug ${
          rebalanceLocked
            ? 'border-amber-500/40 bg-amber-500/10 text-amber-200'
            : 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200'
        }`}
      >
        {rebalanceLocked ? (
          <Lock className="w-4 h-4 shrink-0 mt-0.5" />
        ) : (
          <Zap className="w-4 h-4 shrink-0 mt-0.5" />
        )}
        <p>{rebalanceLockMessage(lang, rebalance)}</p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 min-w-0">
        {[
          { l: sk ? 'Volatilita' : 'Volatility', v: `${indicators.volatilityPct.toFixed(1)}%`, sub: indicators.volatilityRegime },
          { l: sk ? 'Cieľové LTV' : 'Target LTV', v: `${indicators.targetLtvPct}%`, sub: 'ltv' },
          { l: 'USDC Borrow', v: `${indicators.borrowApyPct.toFixed(2)}%`, sub: indicators.borrowWarning ? 'warn' : 'ok' },
          { l: sk ? 'Gas vrstva' : 'Gas layer', v: `${indicators.gasLayerPct.toFixed(1)}%`, sub: indicators.gasStress },
        ].map(item => (
          <div key={item.l} className="rounded-lg border border-border/50 bg-background/40 p-2 min-w-0">
            <p className="text-[9px] text-muted-foreground uppercase tracking-wide truncate">{item.l}</p>
            <p className="font-mono text-sm font-bold text-foreground tabular-nums">{item.v}</p>
            <p className="text-[9px] text-muted-foreground capitalize truncate">{item.sub}</p>
          </div>
        ))}
      </div>

      {indicators.borrowWarning && (
        <div className="rounded-xl border border-red-500/50 bg-red-500/10 p-3 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
          <div className="text-[11px] text-red-200 leading-snug">
            <p className="font-bold">
              {sk ? 'VAROVANIE: Net Borrow Cost > 8%' : 'WARNING: Net Borrow Cost > 8%'}
            </p>
            <p className="mt-1 text-red-200/80">
              {sk
                ? 'Úrok na Aave/Kamino je príliš vysoký. Zváž zníženie taktického kolaterálu a splatenie USDC dlhu.'
                : 'Aave/Kamino borrow rate is too high. Consider reducing tactical collateral and repaying USDC debt.'}
            </p>
          </div>
        </div>
      )}

      {(ethAdvice.eligible || portfolioData.assets.ETH.liquidQty > 0) && (
        <AssetHcdCard
          symbol="ETH"
          lang={lang}
          liquidQty={portfolioData.assets.ETH.liquidQty}
          price={portfolioData.assets.ETH.currentPrice}
          layers={ethLayers}
          rebalanceLocked={rebalanceLocked}
          advised={ethAdvice.eligible ? ethAdvice : null}
        />
      )}

      {(solAdvice.eligible || portfolioData.assets.SOL.liquidQty > 0) && (
        <AssetHcdCard
          symbol="SOL"
          lang={lang}
          liquidQty={portfolioData.assets.SOL.liquidQty}
          price={portfolioData.assets.SOL.currentPrice}
          layers={solLayers}
          rebalanceLocked={rebalanceLocked}
          advised={solAdvice.eligible ? solAdvice : null}
        />
      )}

      <p className="text-[10px] text-muted-foreground leading-snug">
        {sk
          ? 'HCD vrstvy sa dynamicky prispôsobujú live volatilite, borrow APY a gas oracle. Presuny medzi vrstvami sú povolené len v kvartálnych mesiacoch (Marec, Jún, September, December).'
          : 'HCD layers adapt to live volatility, borrow APY, and gas oracle. Layer moves are allowed only in quarterly months (March, June, September, December).'}
      </p>
    </div>
  );
}
