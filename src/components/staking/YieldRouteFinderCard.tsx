import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Lang } from '@/lib/i18n';
import {
  scanYieldRoutes, YieldAsset, YieldNetwork, Strategy,
  ScannerFilters, YieldQuote, RouteHop,
  assessQuoteRisk,
  getRecommendedRoutes, evaluateGasGuard,
  buildOfficialLink, displayOfficialUrl,
  ASSET_USD_PRICE, RecommendedRoute,
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

function HopChain({ hops, risk }: { hops: RouteHop[]; risk?: import('@/lib/stakeRoutingService').RiskAssessment }) {
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
      {hops.map((h, i) => (
        <React.Fragment key={i}>
          <div
            className={`flex flex-col items-start px-2 py-1.5 rounded border text-xs max-w-full ${
              h.kind === 'asset'
                ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
                : 'border-primary/40 bg-primary/15 text-foreground'
            }`}
          >
            <span className="font-medium truncate">{h.label}</span>
            {h.sublabel && <span className="text-[10px] text-muted-foreground truncate">{h.sublabel}</span>}
            {risk && riskCfg && i === lastProtocolIdx && (
              <span className={`mt-0.5 inline-flex items-center gap-0.5 px-1 py-0.5 rounded border text-[9px] font-semibold ${riskCfg.wrap}`}>
                {riskCfg.emoji} {risk.score}/10
              </span>
            )}
          </div>
          {i < hops.length - 1 && <ArrowRight className="w-3 h-3 text-muted-foreground shrink-0" />}
        </React.Fragment>
      ))}
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
          const verdictBorder =
            risk.level === 'low' ? 'border-gain/30 bg-gain/5 text-gain/90' :
            risk.level === 'medium' ? 'border-amber-500/30 bg-amber-500/5 text-amber-300/90' :
            'border-loss/30 bg-loss/5 text-loss/90';
          return (
          <div key={q.protocolId + idx}
               className={`rounded-lg p-3 space-y-2 border ${idx === 0 ? 'border-primary/40 bg-primary/5' : 'border-border/40 bg-secondary/30'}`}>
            <div className="flex items-center justify-between gap-2">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  {idx === 0 && <span className="text-[9px] px-1.5 py-0.5 rounded bg-primary text-primary-foreground font-bold">#1</span>}
                  <p className="text-sm font-bold text-foreground truncate">{q.protocolName}</p>
                  <HealthBadge q={q} />
                </div>
                <p className="text-[10px] text-emerald-400/90">Verified: {q.officialUrl}</p>
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

            <HopChain hops={q.hops} risk={risk} />

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
              href={`https://${q.officialUrl}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-1.5 mt-1 h-9 rounded-md bg-primary text-primary-foreground text-xs font-semibold active:opacity-80"
            >
              {isSk ? 'Otvoriť' : 'Open'} {q.officialUrl} <ExternalLink className="w-3 h-3" />
            </a>
          </div>
          );
        })}

      </div>
    </div>
  );
}
