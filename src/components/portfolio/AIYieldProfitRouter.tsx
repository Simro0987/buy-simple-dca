import { useMemo, useState } from 'react';
import { Sparkles, TrendingUp, ShieldCheck, Activity, ArrowRight, Loader2, ExternalLink, Info, ChevronDown } from 'lucide-react';
import { formatUsd } from '@/lib/crypto';
import { Lang } from '@/lib/i18n';
import { toast } from '@/hooks/use-toast';
import { usePortfolio } from '@/contexts/PortfolioContext';
import { BentoCard } from '@/components/portfolio/ui/BentoCard';
import { MoneyValue } from '@/components/portfolio/ui/MoneyValue';

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

const CG_ID: Record<string, string> = { BTC: 'bitcoin', ETH: 'ethereum', SOL: 'solana' };

export function AIYieldProfitRouter({ lang }: Props) {
  const sk = lang === 'sk';
  const [moving, setMoving] = useState(false);
  const [showWhy, setShowWhy] = useState(false);
  const { profitAvailable, profitBySymbol, selected, markProfitMoved, prices, metrics } = usePortfolio();

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

  // Destination split: diverzifikuj medzi 2 najlepšie protokoly (sUSDS + sUSDe)
  // — bezpečnejší (sUSDS) dostane väčší podiel, vyšší výnos (sUSDe) menší
  const destinationSplit = useMemo(() => {
    const safe = scored.find(s => s.id === 'sUSDS') ?? scored[0];
    const yieldOpt = scored.find(s => s.id === 'sUSDe') ?? scored[1] ?? scored[0];
    // váhy podľa skóre, ale držíme min 30% pre yield optionu pre diverzifikáciu
    const total = safe.score + yieldOpt.score;
    let safePct = total > 0 ? (safe.score / total) * 100 : 60;
    safePct = Math.min(75, Math.max(55, safePct)); // 55–75% safety bias
    const yieldPct = 100 - safePct;
    return [
      { opt: safe, pct: safePct },
      { opt: yieldOpt, pct: yieldPct },
    ];
  }, [scored]);

  // Per-token sell plan: USD amount + token quantity + per-destination split
  const sellPlan = useMemo(() => {
    if (!hasProfit) return [] as Array<{
      symbol: string; usd: number; qty: number; price: number; reason: string;
      splits: Array<{ id: string; color: string; usd: number; pct: number }>;
    }>;
    const entries = Object.entries(profitBySymbol)
      .filter(([sym]) => !selected || sym === selected)
      .map(([sym, usd]) => {
        const cgId = CG_ID[sym];
        const price = prices?.[cgId]?.usd ?? 0;
        const qty = price > 0 ? usd / price : 0;
        const asset = metrics.assets.find(a => a.symbol === sym);
        const dev = asset?.deviationPct ?? 0;
        const reasonSk = dev > 1
          ? `nadvážený o +${dev.toFixed(1)}pp → predaj znižuje koncentráciu`
          : dev < -1
            ? `mierne podvážený (${dev.toFixed(1)}pp) → preferuj iný zdroj`
            : 'na cieľovej váhe → neutrálny presun zisku';
        const reasonEn = dev > 1
          ? `overweight +${dev.toFixed(1)}pp → selling reduces concentration`
          : dev < -1
            ? `underweight (${dev.toFixed(1)}pp) → prefer other source`
            : 'on target → neutral profit move';
        const splits = destinationSplit.map(d => ({
          id: d.opt.id,
          color: d.opt.color,
          usd: usd * (d.pct / 100),
          pct: d.pct,
        }));
        return { symbol: sym, usd, qty, price, reason: sk ? reasonSk : reasonEn, splits };
      })
      .sort((a, b) => b.usd - a.usd);
    return entries;
  }, [profitBySymbol, prices, hasProfit, metrics, selected, sk, destinationSplit]);


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
    <BentoCard padding="lg" className="h-full overflow-hidden">
      <div className="h-0.5 bg-gradient-to-r from-neon-green via-neon-purple to-neon-magenta" />
      <div className="space-y-4 mt-4">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-neon-green" />
          <h3 className="text-sm font-semibold text-white">
            {sk ? 'AI Yield Profit Router' : 'AI Yield Profit Router'}
          </h3>
        </div>

        <div className="rounded-2xl bg-white/[0.03] border border-white/[0.06] p-3 space-y-2">
          <div className="flex items-baseline justify-between">
            <p className="text-[11px] text-white/40">
              {sk ? 'Dostupný zisk na presun' : 'Profit available'}
            </p>
            {hasProfit && (
              <p className="text-[10px] text-white/35">
                → {recommended.id} · {recommended.network}
              </p>
            )}
          </div>
          <MoneyValue size="xl">{hasProfit ? formatUsd(profitAvailable) : '$0.00'}</MoneyValue>
          {hasProfit && Object.keys(profitBySymbol).length > 0 && (
            <div className="space-y-1.5 pt-1">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                {sk ? 'Plán predaja (z čoho, koľko a kam)' : 'Sell plan (from what, how much & where)'}
              </p>
              {sellPlan.map(p => (
                <div key={p.symbol} className="rounded-md bg-secondary/60 border border-border/60 px-2.5 py-2 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] font-bold text-foreground">{p.symbol}</span>
                      <span className="text-[10px] text-muted-foreground">@ {formatUsd(p.price)}</span>
                    </div>
                    <span className="text-[11px] font-semibold text-foreground tabular-nums">
                      {formatUsd(p.usd)}
                    </span>
                  </div>
                  <div className="text-[10px] text-muted-foreground">
                    {sk ? 'Predaj' : 'Sell'}: <span className="font-mono text-foreground">
                      {p.qty.toFixed(p.symbol === 'BTC' ? 6 : p.symbol === 'ETH' ? 4 : 2)} {p.symbol}
                    </span>
                  </div>
                  <div className="space-y-1 pt-0.5 border-t border-border/40">
                    {p.splits.map(s => {
                      const stableQty = s.usd; // 1 stable ≈ $1
                      return (
                        <div key={s.id} className="flex items-center justify-between text-[10px]">
                          <span className="flex items-center gap-1.5">
                            <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: s.color }} />
                            <span className="text-foreground font-medium">→ {s.id}</span>
                            <span className="text-muted-foreground">({s.pct.toFixed(0)}%)</span>
                          </span>
                          <span className="font-mono text-foreground tabular-nums">
                            {formatUsd(s.usd)} <span className="text-muted-foreground">≈ {stableQty.toFixed(2)} {s.id}</span>
                          </span>
                        </div>
                      );
                    })}
                  </div>
                  <p className="text-[10px] text-primary/80">{p.reason}</p>
                </div>
              ))}
              {/* Destination totals */}
              <div className="rounded-md bg-primary/5 border border-primary/20 px-2.5 py-2 mt-2">
                <p className="text-[10px] uppercase tracking-wide text-primary/80 mb-1">
                  {sk ? 'Spolu kam presunúť' : 'Total destinations'}
                </p>
                {destinationSplit.map(d => {
                  const total = profitAvailable * (d.pct / 100);
                  return (
                    <div key={d.opt.id} className="flex items-center justify-between text-[11px]">
                      <span className="flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full" style={{ backgroundColor: d.opt.color }} />
                        <span className="text-foreground font-semibold">{d.opt.id}</span>
                        <span className="text-[10px] text-muted-foreground">
                          · {d.opt.network} · {d.opt.apy.toFixed(1)}% APY
                        </span>
                      </span>
                      <span className="font-semibold text-foreground tabular-nums">
                        {formatUsd(total)} <span className="text-muted-foreground text-[10px]">({d.pct.toFixed(0)}%)</span>
                      </span>
                    </div>
                  );
                })}
              </div>
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

          <button
            onClick={() => setShowWhy(s => !s)}
            className="w-full flex items-center justify-center gap-1 text-[10px] text-muted-foreground hover:text-foreground pt-1"
          >
            <Info className="w-3 h-3" />
            {showWhy ? (sk ? 'Skryť indikátory' : 'Hide indicators') : (sk ? 'Prečo práve tento token? (indikátory)' : 'Why this token? (indicators)')}
            <ChevronDown className={`w-3 h-3 transition-transform ${showWhy ? 'rotate-180' : ''}`} />
          </button>

          {showWhy && (
            <div className="space-y-1.5 pt-1">
              <p className="text-[10px] text-muted-foreground leading-relaxed">
                {sk
                  ? 'Skóre 0–100 váži 7 indikátorov. Vyhráva token s najvyšším celkovým skóre, istota = odstup od 2. miesta.'
                  : 'Score 0–100 weights 7 indicators. Winner = highest total; confidence = gap to runner-up.'}
              </p>
              {[
                { k: sk ? 'APY (výnos)' : 'APY (yield)', w: '25%', v: `${recommended.apy.toFixed(1)}%`, d: sk ? 'Anualizovaný výnos protokolu.' : 'Annualized protocol yield.' },
                { k: sk ? 'Stabilita APY' : 'APY stability', w: '20%', v: `${recommended.apyStability}/100`, d: sk ? 'Ako sa APY mení v čase (vyššie = predvídateľnejšie).' : 'How stable APY is over time.' },
                { k: sk ? 'Peg stability' : 'Peg stability', w: '20%', v: `${recommended.pegStability}/100`, d: sk ? 'Ako pevne sa stable drží $1.' : 'How tightly the stable holds $1.' },
                { k: sk ? 'Smart-contract riziko' : 'Smart-contract risk', w: '15%', v: `${recommended.scRisk}/100`, d: sk ? 'Audity, vek protokolu, history exploitov (vyššie = bezpečnejšie).' : 'Audits, age, exploit history (higher = safer).' },
                { k: sk ? 'Likvidita' : 'Liquidity', w: '10%', v: `${recommended.liquidity}/100`, d: sk ? 'Ako rýchlo vieš vystúpiť bez slippage.' : 'How fast you can exit without slippage.' },
                { k: 'TVL', w: '5%', v: `$${recommended.tvlBn.toFixed(1)}B`, d: sk ? 'Total Value Locked – väčší = robustnejší.' : 'Total Value Locked – bigger = more robust.' },
                { k: sk ? 'Funding penále' : 'Funding penalty', w: '5%', v: recommended.fundingRate > 0 ? `${recommended.fundingRate.toFixed(1)}%` : '—', d: sk ? 'Ak APY závisí od futures funding, je riskantnejší.' : 'APY tied to funding rates is riskier.' },
                { k: sk ? 'Poplatky' : 'Fees', w: '−', v: `${recommended.feeBps} bps`, d: sk ? 'Vstupné/výstupné fee protokolu.' : 'Entry/exit fee of protocol.' },
              ].map(i => (
                <div key={i.k} className="flex items-start justify-between gap-2 rounded-md bg-secondary/30 px-2.5 py-1.5">
                  <div className="min-w-0 flex-1">
                    <p className="text-[11px] font-medium text-foreground">{i.k} <span className="text-[9px] text-muted-foreground">· váha {i.w}</span></p>
                    <p className="text-[10px] text-muted-foreground leading-tight">{i.d}</p>
                  </div>
                  <span className="text-[11px] font-semibold text-foreground tabular-nums shrink-0">{i.v}</span>
                </div>
              ))}
            </div>
          )}
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
          className="w-full flex items-center justify-center gap-2 rounded-2xl bg-neon-green text-black py-2.5 text-sm font-semibold disabled:opacity-50"
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
        <p className="text-[10px] text-white/35 text-center">
          {sk
            ? 'Appka nič nepresunie automaticky — transakciu potvrdíš vo svojom walleti.'
            : 'Nothing is moved automatically — you confirm the transaction in your wallet.'}
        </p>
      </div>
    </BentoCard>
  );
}
