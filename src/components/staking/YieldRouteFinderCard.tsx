import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Lang } from '@/lib/i18n';
import {
  scanYieldRoutes, YieldAsset, YieldNetwork, Strategy,
  ScannerFilters, YieldQuote, RouteHop,
  assessQuoteRisk,
  getRecommendedRoutes, evaluateGasGuard,
  buildOfficialLink, displayOfficialUrl,
  ASSET_USD_PRICE, RecommendedRoute,
  isDerivative, getPegStatus, detectRouteDepegs, depegAlertMessage, PegStatus,
} from '@/lib/stakeRoutingService';
import { Radar, ArrowRight, ExternalLink, AlertTriangle, ShieldCheck, Zap, Sparkles, Fuel } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { RiskShield } from './RiskShield';


interface Props { lang: Lang; }

const ASSETS: YieldAsset[] = ['BTC','ETH','SOL','stETH','wstETH','weETH','cbBTC','WBTC','LBTC','JitoSOL','mSOL','bSOL'];
const NETWORKS: YieldNetwork[] = ['Ethereum','Solana','Arbitrum','Base','Polygon'];
const STRATEGIES: { value: Strategy; label: string }[] = [
  { value: 'liquid_staking', label: 'Liquid Staking' },
  { value: 'restaking',      label: 'Restaking' },
  { value: 'lending',        label: 'Lending' },
  { value: 'liquidity',      label: 'Liquidity Pools' },
];

function HopChain({ hops, risk, tick = 0 }: { hops: RouteHop[]; risk?: import('@/lib/stakeRoutingService').RiskAssessment; tick?: number }) {
  // attach the risk badge to the last protocol hop
  const lastProtocolIdx = (() => {
    for (let i = hops.length - 1; i >= 0; i--) if (hops[i].kind === 'protocol') return i;
    return -1;
  })();
  const riskCfg = risk
    ? risk.level === 'low'
      ? { wrap: 'bg-gain/15 text-gain border-gain/40', emoji: '🟢' }
      : risk.level === 'medium'
        ? { wrap: 'bg-amber-500/15 text-amber-400 border-amber-500/40', emoji: '🟡' }
        : { wrap: 'bg-loss/15 text-loss border-loss/40', emoji: '🔴' }
    : null;

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {hops.map((h, i) => {
        const peg = h.kind === 'asset' && isDerivative(h.label) ? getPegStatus(h.label, tick) : null;
        const pegCritical = peg?.severity === 'critical';
        return (
        <React.Fragment key={i}>
          <div
            className={`flex flex-col items-start px-2 py-1.5 rounded border text-xs max-w-full ${
              h.kind === 'asset'
                ? pegCritical
                  ? 'border-loss/60 bg-loss/10 text-loss animate-pulse'
                  : 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
                : 'border-primary/40 bg-primary/15 text-foreground'
            }`}
          >
            <span className="font-medium truncate">{h.label}</span>
            {h.sublabel && <span className="text-[10px] text-muted-foreground truncate">{h.sublabel}</span>}
            {peg && (
              <span className={`mt-0.5 text-[9px] font-semibold ${pegCritical ? 'text-loss' : 'text-gain'}`}>
                {pegCritical ? '🔴' : '🟢'} {pegCritical ? 'Depeg' : 'Parity'}: {peg.ratio.toFixed(4)}x
              </span>
            )}
            {risk && riskCfg && i === lastProtocolIdx && (
              <span className={`mt-0.5 inline-flex items-center gap-0.5 px-1 py-0.5 rounded border text-[9px] font-semibold ${riskCfg.wrap}`}>
                {riskCfg.emoji} {risk.score}/10
              </span>
            )}
          </div>
          {i < hops.length - 1 && <ArrowRight className="w-3 h-3 text-muted-foreground shrink-0" />}
        </React.Fragment>
        );
      })}
    </div>
  );
}


function HealthBadge({ q }: { q: YieldQuote }) {
  if (q.health === 'ok') {
    return <span className="text-[10px] px-1.5 py-0.5 rounded bg-gain/15 text-gain border border-gain/30">Healthy</span>;
  }
  const color =
    q.health === 'security_risk' ? 'bg-loss/15 text-loss border-loss/30' :
    q.health === 'paused'        ? 'bg-loss/15 text-loss border-loss/30' :
    'bg-amber-500/15 text-amber-400 border-amber-500/30';
  return (
    <span className={`text-[10px] px-1.5 py-0.5 rounded border ${color}`}>
      {q.health.replace('_', ' ')}
    </span>
  );
}

export function YieldRouteFinderCard({ lang }: Props) {
  const isSk = lang === 'sk';
  const [asset, setAsset] = useState<YieldAsset>('SOL');
  const [network, setNetwork] = useState<YieldNetwork>('Solana');
  const [strategy, setStrategy] = useState<Strategy>('liquid_staking');
  const [filters, setFilters] = useState<ScannerFilters>({
    noLockup: false,
    auditedOnly: true,
    mevOnly: false,
    isolatedOnly: false,
    excludeUnhealthy: true,
  });
  const [tick, setTick] = useState(0);
  const [depositAmount, setDepositAmount] = useState<string>('1');

  const focusRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    const id = setInterval(() => {
      focusRef.current = document.activeElement as HTMLElement | null;
      setTick(t => t + 1);
      requestAnimationFrame(() => focusRef.current?.focus?.());
    }, 17000);
    return () => clearInterval(id);
  }, []);

  const quotes = useMemo(
    () => scanYieldRoutes({ asset, network, strategy, filters, tick }),
    [asset, network, strategy, filters, tick]
  );

  const recommended: RecommendedRoute[] = useMemo(
    () => getRecommendedRoutes(asset, tick, isSk ? 'sk' : 'en'),
    [asset, tick, isSk]
  );

  const depositUsd = useMemo(() => {
    const amt = parseFloat(depositAmount.replace(',', '.')) || 0;
    return amt * (ASSET_USD_PRICE[asset] ?? 0);
  }, [depositAmount, asset]);

  const toggleLabels: { key: keyof ScannerFilters; sk: string; en: string }[] = [
    { key: 'noLockup',         sk: 'Bez časového lockupu',                  en: 'No Temporal Lockup' },
    { key: 'auditedOnly',      sk: 'Iba auditované (TVL ≥ $100M)',         en: 'Audited & Battle-Tested Only' },
    { key: 'mevOnly',          sk: 'MEV-boosted validátori',                en: 'MEV Boosted Validators' },
    { key: 'isolatedOnly',     sk: 'Iba izolované lending trhy',            en: 'Isolated Lending Markets Only' },
    { key: 'excludeUnhealthy', sk: 'Skryť pretažené / rozbité layery',     en: 'Filter Out Exploited / Broken Layers' },
  ];

  return (
    <div className="glass-card p-4 space-y-4 border border-primary/20">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Radar className="w-4 h-4 text-primary" />
          <h2 className="text-sm font-bold text-foreground">
            {isSk ? 'Yield Route Finder & Scanner' : 'Yield Route Finder & Scanner'}
          </h2>
        </div>
        <span className="text-[10px] text-muted-foreground flex items-center gap-1">
          <Zap className="w-3 h-3 text-gain" /> {isSk ? 'Auto-refresh 17s' : 'Auto-refresh 17s'}
        </span>
      </div>

      {/* Inputs */}
      <div className="grid grid-cols-3 gap-2">
        <div>
          <Label className="text-[10px] text-muted-foreground">From Asset</Label>
          <select
            value={asset}
            onChange={e => setAsset(e.target.value as YieldAsset)}
            className="w-full mt-1 h-9 bg-background border border-border rounded-md px-2 text-xs font-medium text-foreground"
          >
            {ASSETS.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
        </div>
        <div>
          <Label className="text-[10px] text-muted-foreground">Network</Label>
          <select
            value={network}
            onChange={e => setNetwork(e.target.value as YieldNetwork)}
            className="w-full mt-1 h-9 bg-background border border-border rounded-md px-2 text-xs font-medium text-foreground"
          >
            {NETWORKS.map(n => <option key={n} value={n}>{n}</option>)}
          </select>
        </div>
        <div>
          <Label className="text-[10px] text-muted-foreground">Strategy</Label>
          <select
            value={strategy}
            onChange={e => setStrategy(e.target.value as Strategy)}
            className="w-full mt-1 h-9 bg-background border border-border rounded-md px-2 text-xs font-medium text-foreground"
          >
            {STRATEGIES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </div>
      </div>

      {/* Filters */}
      <div className="space-y-2 bg-secondary/30 border border-border/40 rounded-lg p-3">
        <p className="text-[10px] uppercase tracking-wide text-muted-foreground flex items-center gap-1">
          <ShieldCheck className="w-3 h-3" /> {isSk ? 'Bezpečnostné filtre' : 'Security filters'}
        </p>
        {toggleLabels.map(t => (
          <div key={t.key} className="flex items-center justify-between gap-2">
            <span className="text-[11px] text-foreground">{isSk ? t.sk : t.en}</span>
            <Switch
              checked={filters[t.key]}
              onCheckedChange={v => setFilters(prev => ({ ...prev, [t.key]: v }))}
            />
          </div>
        ))}
      </div>

      {/* Deposit amount (for gas-fee guard) */}
      <div className="grid grid-cols-[1fr_auto] gap-2 items-end">
        <div>
          <Label className="text-[10px] text-muted-foreground">
            {isSk ? `Vklad (${asset})` : `Deposit (${asset})`}
          </Label>
          <Input
            type="text"
            inputMode="decimal"
            value={depositAmount}
            onChange={e => setDepositAmount(e.target.value)}
            className="h-9 text-xs mt-1"
            placeholder="0.0"
          />
        </div>
        <div className="text-right shrink-0">
          <p className="text-[9px] text-muted-foreground">USD</p>
          <p className="text-sm font-bold text-foreground">
            ${depositUsd.toLocaleString(undefined, { maximumFractionDigits: 0 })}
          </p>
        </div>
      </div>

      {/* Autonomous Recommended Routes */}
      {recommended.length > 0 && (
        <div className="space-y-2">
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground flex items-center gap-1">
            <Sparkles className="w-3 h-3 text-primary" />
            {isSk
              ? `Odporúčané trasy pre ${asset}`
              : `Recommended routes for ${asset}`}
          </p>
          {recommended.map(r => {
            const tierBorder =
              r.risk.level === 'low' ? 'border-gain/40 bg-gain/5' :
              r.risk.level === 'medium' ? 'border-amber-500/40 bg-amber-500/5' :
              'border-loss/40 bg-loss/5';
            const gas = evaluateGasGuard({
              network: r.network,
              depositUsd,
              multiHop: r.multiHop,
              lang: isSk ? 'sk' : 'en',
            });
            const primary = r.steps[0];
            const depegs = detectRouteDepegs(r.hops, tick);
            return (
              <div key={r.tier} className={`rounded-lg border p-3 space-y-2 ${tierBorder} ${depegs.length ? 'ring-2 ring-loss/60' : ''}`}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-foreground">
                      {r.emoji} {isSk ? r.title.sk : r.title.en}
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                      {r.network} · {r.steps.length === 1
                        ? (isSk ? '100% kapitálu' : '100% capital allocation')
                        : (isSk ? 'Riadený split kapitálu' : 'Managed capital split')}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-base font-bold text-gain">{r.blendedApy.toFixed(2)}%</p>
                    <p className="text-[9px] text-muted-foreground">{isSk ? 'Zmiešaná APY' : 'Blended APY'}</p>
                  </div>
                </div>

                <RiskShield risk={r.risk} lang={lang} />

                {/* Split breakdown */}
                <div className="space-y-1">
                  {r.steps.map((s, i) => (
                    <div key={i} className="flex items-center justify-between gap-2 text-[11px] bg-background/60 border border-border/40 rounded px-2 py-1.5">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-primary/20 text-primary shrink-0">
                          {s.pct}%
                        </span>
                        <div className="min-w-0">
                          <p className="font-semibold text-foreground truncate">{s.protocolName}</p>
                          <p className="text-[9px] text-emerald-400/90 truncate">
                            Verified: {displayOfficialUrl(s.officialUrl)}
                          </p>
                        </div>
                      </div>
                      <span className="text-gain font-semibold shrink-0">{s.apy.toFixed(2)}%</span>
                    </div>
                  ))}
                </div>

                <HopChain hops={r.hops} risk={r.risk} tick={tick} />

                {depegs.map(p => (
                  <div key={p.asset} className="flex items-start gap-2 p-2 rounded border border-loss/60 bg-loss/15 animate-pulse">
                    <AlertTriangle className="w-3.5 h-3.5 text-loss mt-0.5 shrink-0" />
                    <p className="text-[10px] text-loss leading-snug font-semibold">{depegAlertMessage(isSk ? 'sk' : 'en', p)}</p>
                  </div>
                ))}

                {gas && (
                  <div className="flex items-start gap-2 p-2 rounded border border-amber-500/40 bg-amber-500/10">
                    <Fuel className="w-3.5 h-3.5 text-amber-400 mt-0.5 shrink-0" />
                    <p className="text-[10px] text-amber-300 leading-snug">{gas.message}</p>
                  </div>
                )}

                <a
                  href={buildOfficialLink(primary.officialUrl)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center gap-1.5 h-9 rounded-md bg-primary text-primary-foreground text-xs font-semibold active:opacity-80"
                >
                  {isSk ? 'Spustiť trasu cez' : 'Go to Platform'} {displayOfficialUrl(primary.officialUrl)} <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            );
          })}
        </div>
      )}

      {/* Results */}
      <div className="space-y-2">
        <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
          {quotes.length} {isSk ? 'výsledkov' : 'results'}
        </p>
        {quotes.length === 0 && (
          <div className="flex items-start gap-2 p-3 rounded border border-amber-500/30 bg-amber-500/10">
            <AlertTriangle className="w-4 h-4 text-amber-400 mt-0.5" />
            <p className="text-[11px] text-amber-300">
              {isSk
                ? 'Žiadne trasy nevyhovujú aktívnym filtrom. Skús uvoľniť bezpečnostné filtre.'
                : 'No routes match the active filters. Try relaxing the security filters.'}
            </p>
          </div>
        )}

        {quotes.map((q, idx) => {
          const risk = assessQuoteRisk(q, isSk ? 'sk' : 'en');
          const quoteDepegs = detectRouteDepegs(q.hops, tick);
          const verdictBorder =
            risk.level === 'low' ? 'border-gain/30 bg-gain/5 text-gain/90' :
            risk.level === 'medium' ? 'border-amber-500/30 bg-amber-500/5 text-amber-300/90' :
            'border-loss/30 bg-loss/5 text-loss/90';
          return (
          <div key={q.protocolId + idx}
               className={`rounded-lg p-3 space-y-2 border ${idx === 0 ? 'border-primary/40 bg-primary/5' : 'border-border/40 bg-secondary/30'} ${quoteDepegs.length ? 'ring-2 ring-loss/60' : ''}`}>
            <div className="flex items-center justify-between gap-2">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  {idx === 0 && <span className="text-[9px] px-1.5 py-0.5 rounded bg-primary text-primary-foreground font-bold">#1</span>}
                  <p className="text-sm font-bold text-foreground truncate">{q.protocolName}</p>
                  <HealthBadge q={q} />
                </div>
                <p className="text-[10px] text-emerald-400/90">Verified: {displayOfficialUrl(q.officialUrl)}</p>
              </div>
              <div className="text-right shrink-0">
                <p className="text-base font-bold text-gain">{q.apy.toFixed(2)}%</p>
                <p className="text-[9px] text-muted-foreground">APY</p>
              </div>
            </div>

            <div className={`text-[10px] leading-snug px-2 py-1.5 rounded border ${verdictBorder}`}>
              {risk.verdict}
            </div>

            <div className="flex items-center justify-between gap-2 flex-wrap">
              <RiskShield risk={risk} lang={lang} />
            </div>

            <HopChain hops={q.hops} risk={risk} tick={tick} />

            {quoteDepegs.map(p => (
              <div key={p.asset} className="flex items-start gap-2 p-2 rounded border border-loss/60 bg-loss/15 animate-pulse">
                <AlertTriangle className="w-3.5 h-3.5 text-loss mt-0.5 shrink-0" />
                <p className="text-[10px] text-loss leading-snug font-semibold">{depegAlertMessage(isSk ? 'sk' : 'en', p)}</p>
              </div>
            ))}

            <div className="flex flex-wrap items-center gap-1.5 text-[10px]">
              <span className="px-1.5 py-0.5 rounded bg-secondary text-secondary-foreground">{q.category}</span>
              <span className="px-1.5 py-0.5 rounded bg-secondary text-secondary-foreground">TVL ${q.tvlUsdM >= 1000 ? (q.tvlUsdM/1000).toFixed(1)+'B' : q.tvlUsdM+'M'}</span>
              <span className={`px-1.5 py-0.5 rounded ${q.unbondingDays === 0 ? 'bg-gain/15 text-gain' : 'bg-amber-500/15 text-amber-400'}`}>
                {q.unbondingDays === 0 ? (isSk ? 'Instant exit' : 'Instant exit') : `${q.unbondingDays}d unbonding`}
              </span>
              {q.mevBoost && <span className="px-1.5 py-0.5 rounded bg-accent/15 text-accent">MEV boost</span>}
              {q.isolatedMarkets && <span className="px-1.5 py-0.5 rounded bg-accent/15 text-accent">Isolated</span>}
            </div>

            {q.healthNote && (
              <p className="text-[10px] text-amber-300/90">⚠ {q.healthNote}</p>
            )}

            <a
              href={buildOfficialLink(q.officialUrl)}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-1.5 mt-1 h-9 rounded-md bg-primary text-primary-foreground text-xs font-semibold active:opacity-80"
            >
              {isSk ? 'Otvoriť' : 'Open'} {displayOfficialUrl(q.officialUrl)} <ExternalLink className="w-3 h-3" />
            </a>
          </div>
          );
        })}

      </div>
    </div>
  );
}
