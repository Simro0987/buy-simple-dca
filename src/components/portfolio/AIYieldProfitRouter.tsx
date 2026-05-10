import { useMemo, useState } from 'react';
import { Sparkles, TrendingUp, ShieldCheck, Activity, ArrowRight, Loader2, ExternalLink, Info, ChevronDown } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { formatUsd } from '@/lib/crypto';
import { Lang } from '@/lib/i18n';
import { toast } from '@/hooks/use-toast';
import { usePortfolio } from '@/contexts/PortfolioContext';

interface Props {
  lang: Lang;
}

interface StableOption {
  id: 'sUSDe' | 'sUSDS' | 'sDAI';
  name: string;
  apy: number;
  apyStability: number;
  fundingRate: number;
  tvlBn: number;
  pegStability: number;
  liquidity: number;
  scRisk: number;
  feeBps: number;
  color: string;
  network: 'Base' | 'Arbitrum' | 'Ethereum';
  protocol: string;
  url: string;
}

const OPTIONS: StableOption[] = [
  {
    id: 'sUSDe', name: 'Ethena sUSDe',
    apy: 12.4, apyStability: 55, fundingRate: 9.8,
    tvlBn: 3.1, pegStability: 78, liquidity: 88, scRisk: 70, feeBps: 8,
    color: '#8b5cf6', network: 'Arbitrum', protocol: 'Ethena',
    url: 'https://app.ethena.fi/',
  },
  {
    id: 'sUSDS', name: 'Sky sUSDS',
    apy: 7.5, apyStability: 92, fundingRate: 0,
    tvlBn: 1.6, pegStability: 96, liquidity: 82, scRisk: 88, feeBps: 5,
    color: '#10b981', network: 'Base', protocol: 'Sky Protocol',
    url: 'https://app.sky.money/',
  },
  {
    id: 'sDAI', name: 'MakerDAO sDAI',
    apy: 6.2, apyStability: 95, fundingRate: 0,
    tvlBn: 1.2, pegStability: 97, liquidity: 80, scRisk: 92, feeBps: 6,
    color: '#f59e0b', network: 'Base', protocol: 'MakerDAO',
    url: 'https://spark.fi/',
  },
];

interface Scored extends StableOption {
  score: number;
  confidence: number;
  reasonSk: string;
  reasonEn: string;
}

function scoreOptions(opts: StableOption[]): Scored[] {
  // Normalized weighted score (0..100)
  // Weights: APY 25, stability 20, peg 20, scRisk 15, liquidity 10, tvl 5, fees -5, fundingPenalty
  const maxApy = Math.max(...opts.map(o => o.apy));
  return opts.map(o => {
    const apyScore = (o.apy / maxApy) * 100;
    const tvlScore = Math.min(100, (o.tvlBn / 3) * 100);
    const feePenalty = o.feeBps; // small
    const fundingPenalty = o.fundingRate > 0 ? Math.max(0, 30 - o.fundingRate) : 30; // higher funding = riskier reward
    const score =
      apyScore * 0.25 +
      o.apyStability * 0.20 +
      o.pegStability * 0.20 +
      o.scRisk * 0.15 +
      o.liquidity * 0.10 +
      tvlScore * 0.05 +
      fundingPenalty * 0.05 -
      feePenalty * 0.5;

    const reasonSk =
      o.id === 'sUSDS'
        ? 'Nižšia volatilita, silný peg a stabilný výnos.'
        : o.id === 'sDAI'
        ? 'Najnižšie smart-contract riziko a najstabilnejší peg.'
        : 'Najvyššie APY, ale závislé od funding rates.';
    const reasonEn =
      o.id === 'sUSDS'
        ? 'Lower volatility, strong peg, stable yield.'
        : o.id === 'sDAI'
        ? 'Lowest smart-contract risk, strongest peg.'
        : 'Highest APY but depends on funding rates.';

    return { ...o, score, confidence: 0, reasonSk, reasonEn };
  });
}

export function AIYieldProfitRouter({ lang }: Props) {
  const sk = lang === 'sk';
  const [moving, setMoving] = useState(false);
  const { profitAvailable, profitBySymbol, selected, markProfitMoved } = usePortfolio();

  const scored = useMemo(() => {
    const s = scoreOptions(OPTIONS).sort((a, b) => b.score - a.score);
    const top = s[0].score;
    const second = s[1]?.score ?? 0;
    const gap = top - second;
    const conf = Math.round(Math.min(95, 60 + gap * 2));
    s[0].confidence = conf;
    return s;
  }, []);

  const recommended = scored[0];
  const hasProfit = profitAvailable > 1;

  const handleMove = () => {
    setMoving(true);
    setTimeout(() => {
      setMoving(false);
      markProfitMoved(profitAvailable);
      toast({
        title: sk ? 'Otvor wallet a potvrď transakciu' : 'Open wallet and confirm',
        description: sk
          ? `Presúvam ${formatUsd(profitAvailable)} zisk do ${recommended.id}${selected ? ` (zo ziskov ${selected})` : ''}.`
          : `Moving ${formatUsd(profitAvailable)} profit into ${recommended.id}${selected ? ` (from ${selected} gains)` : ''}.`,
      });
    }, 700);
  };

  return (
    <Card className="border-border bg-card overflow-hidden">
      <div className="h-1 bg-gradient-to-r from-primary via-purple-500 to-pink-500" />
      <CardContent className="p-5 space-y-4">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-primary" />
          <h3 className="text-sm font-semibold text-foreground">
            {sk ? 'AI Yield Profit Router' : 'AI Yield Profit Router'}
          </h3>
        </div>

        {/* Profit available */}
        <div className="rounded-lg bg-secondary/40 p-3 space-y-2">
          <div className="flex items-baseline justify-between">
            <p className="text-[11px] text-muted-foreground">
              {sk ? 'Dostupný zisk na presun' : 'Profit available'}
            </p>
            {hasProfit && (
              <p className="text-[10px] text-muted-foreground">
                → {recommended.id} · {recommended.network}
              </p>
            )}
          </div>
          <p className="text-2xl font-bold text-foreground">
            {hasProfit ? formatUsd(profitAvailable) : '$0.00'}
          </p>
          {hasProfit && Object.keys(profitBySymbol).length > 0 && (
            <div className="flex flex-wrap gap-1.5 pt-1">
              {Object.entries(profitBySymbol).map(([sym, val]) => (
                <span
                  key={sym}
                  className="text-[10px] px-2 py-0.5 rounded-full bg-secondary text-foreground border border-border"
                >
                  {sym}: <span className="font-semibold">{formatUsd(val)}</span>
                </span>
              ))}
            </div>
          )}
          {!hasProfit && (
            <p className="text-[11px] text-muted-foreground">
              {sk
                ? 'Zatiaľ žiadny realizovateľný zisk z portfólia.'
                : 'No realizable profit yet.'}
            </p>
          )}
        </div>

        {/* Recommendation */}
        <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[11px] uppercase tracking-wide text-primary font-semibold">
              {sk ? 'AI odporúčanie' : 'AI Recommendation'}
            </span>
            <span className="text-[11px] font-medium text-foreground">
              {sk ? 'Istota' : 'Confidence'}: {recommended.confidence}%
            </span>
          </div>
          <div className="flex items-center gap-2">
            <div
              className="w-9 h-9 rounded-full flex items-center justify-center text-[10px] font-bold"
              style={{ backgroundColor: recommended.color + '20', color: recommended.color }}
            >
              {recommended.id.slice(1, 4)}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-foreground">
                {sk
                  ? `Presuň ${hasProfit ? formatUsd(profitAvailable) : 'zisk'} do ${recommended.id}`
                  : `Move ${hasProfit ? formatUsd(profitAvailable) : 'profit'} to ${recommended.id}`}
              </p>
              <p className="text-[11px] text-muted-foreground truncate">
                {recommended.protocol} · {recommended.network}
              </p>
            </div>
            <a
              href={recommended.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-muted-foreground hover:text-foreground shrink-0"
              aria-label="Open protocol"
            >
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </div>
          <p className="text-[11px] text-muted-foreground">
            {sk ? recommended.reasonSk : recommended.reasonEn}
          </p>
          <div className="flex items-center gap-3 text-[11px] text-muted-foreground pt-1">
            <span className="flex items-center gap-1">
              <TrendingUp className="w-3 h-3 text-green-400" />
              {recommended.apy.toFixed(1)}% APY
            </span>
            <span className="flex items-center gap-1">
              <ShieldCheck className="w-3 h-3 text-blue-400" />
              peg {recommended.pegStability}
            </span>
            <span className="flex items-center gap-1">
              <Activity className="w-3 h-3 text-yellow-400" />
              ${recommended.tvlBn.toFixed(1)}B TVL
            </span>
          </div>
        </div>

        {/* Comparison */}
        <div className="space-y-1.5">
          <p className="text-[11px] text-muted-foreground">
            {sk ? 'Porovnanie možností' : 'Compared options'}
          </p>
          {scored.map(o => (
            <div
              key={o.id}
              className="flex items-center justify-between bg-secondary/30 rounded-md px-3 py-2"
            >
              <div className="flex items-center gap-2 min-w-0">
                <div
                  className="w-2 h-2 rounded-full shrink-0"
                  style={{ backgroundColor: o.color }}
                />
                <span className="text-xs font-medium text-foreground">{o.id}</span>
                <span className="text-[10px] text-muted-foreground truncate">
                  · {o.apy.toFixed(1)}% · stab {o.apyStability}
                  {o.fundingRate > 0 ? ` · funding ${o.fundingRate.toFixed(1)}%` : ''}
                </span>
              </div>
              <span className="text-[11px] font-semibold text-foreground">
                {o.score.toFixed(0)}
              </span>
            </div>
          ))}
        </div>

        {/* Action */}
        <button
          onClick={handleMove}
          disabled={!hasProfit || moving}
          className="w-full flex items-center justify-center gap-2 rounded-lg bg-primary text-primary-foreground py-2.5 text-sm font-semibold disabled:opacity-50"
        >
          {moving ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <>
              {sk ? 'Presuň zisk' : 'Move Profit'}
              <ArrowRight className="w-4 h-4" />
            </>
          )}
        </button>
        <p className="text-[10px] text-muted-foreground text-center">
          {sk
            ? 'Appka nič nepresunie automaticky — transakciu potvrdíš vo svojom walleti.'
            : 'Nothing is moved automatically — you confirm the transaction in your wallet.'}
        </p>
      </CardContent>
    </Card>
  );
}
