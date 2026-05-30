import { useEffect, useMemo, useState } from 'react';
import { ArrowUpDown, ExternalLink, Info, Search, Sparkles, Zap, Clock, Ban } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import {
  CHAINS, CHAIN_ORDER, ChainId, TOKENS, TokenMeta, getQuotes, tokenKey, tokenUsdPrice,
  formatTokenAmount, formatUsd, formatMin, detectSwapType,
} from '@/lib/swapRoutingService';
import { usePrices } from '@/hooks/usePrices';
import { Lang } from '@/lib/i18n';

interface Props { lang: Lang; }

function tokensByChain(chain: ChainId) {
  return TOKENS.filter(t => t.chain === chain);
}

function AssetSelector({
  label, value, onChange,
}: { label: string; value: TokenMeta; onChange: (t: TokenMeta) => void }) {
  return (
    <div className="space-y-1.5">
      <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{label}</span>
      <div className="grid grid-cols-2 gap-2">
        <select
          value={value.chain}
          onChange={(e) => {
            const newChain = e.target.value as ChainId;
            const first = tokensByChain(newChain)[0];
            if (first) onChange(first);
          }}
          className="h-10 rounded-md border border-input bg-background/60 px-2 text-xs font-semibold text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
        >
          {CHAIN_ORDER.map(c => (
            <option key={c} value={c}>{CHAINS[c].icon} {CHAINS[c].name}</option>
          ))}
        </select>
        <select
          value={value.symbol}
          onChange={(e) => {
            const t = tokensByChain(value.chain).find(x => x.symbol === e.target.value);
            if (t) onChange(t);
          }}
          className="h-10 rounded-md border border-input bg-background/60 px-2 text-xs font-semibold text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
        >
          {tokensByChain(value.chain).map(t => (
            <option key={tokenKey(t)} value={t.symbol}>
              {t.symbol}{t.native ? ' (Native)' : ''}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

export function SwapPage({ lang }: Props) {
  const { data: prices } = usePrices();
  const [from, setFrom] = useState<TokenMeta>(TOKENS.find(t => t.chain === 'base' && t.symbol === 'USDC')!);
  const [to, setTo] = useState<TokenMeta>(TOKENS.find(t => t.chain === 'base' && t.symbol === 'cbBTC')!);
  const [amountStr, setAmountStr] = useState<string>('100');
  const [scanning, setScanning] = useState(false);
  const [tick, setTick] = useState(0);
  const [showInfo, setShowInfo] = useState(false);

  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 60_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    setScanning(true);
    const id = setTimeout(() => setScanning(false), 700);
    return () => clearTimeout(id);
  }, [amountStr, from, to]);

  const amount = parseFloat(amountStr) || 0;
  const { quotes, best, swapType } = useMemo(
    () => getQuotes({ from, to, amount, prices, freshnessTick: tick }),
    [from, to, amount, prices, tick],
  );

  const fromUsd = tokenUsdPrice(from, prices) * amount;
  const sameToken = from.chain === to.chain && from.symbol === to.symbol;
  const liveSwapType = detectSwapType(from, to);

  const handleSwitch = () => {
    setFrom(to);
    setTo(from);
  };

  const t = lang === 'sk'
    ? {
        title: 'SWAP Skener',
        sub: 'Porovnaj agregátory a swapni manuálne tam, kde dostaneš najviac.',
        from: 'Z (zdroj)', to: 'Na (cieľ)', amount: 'Suma', best: 'NAJLEPŠÍ KURZ / NAJNIŽŠÍ POPLATOK',
        scan: 'Skenujem protokoly…', expected: 'Očakávaný výstup', netFee: 'Sieť + gas',
        bridgeFee: 'Bridge fee', time: 'Čas', cta: 'Otvoriť',
        all: 'Všetky platformy (zoradené podľa čistého výstupu)',
        info: 'Tento nástroj skenuje agregátory a bridge protokoly, aby našiel najlepší kurz. Kliknutím na tlačidlo budeš bezpečne presmerovaný na vybranú platformu, kde swap dokončíš vlastnou peňaženkou. Žiadne transakcie sa tu nevykonávajú.',
        invalid: 'Vyber dva rôzne tokeny.', enter: 'Zadaj sumu pre skenovanie protokolov.',
        sameChain: 'Same-Chain Swap', crossChain: 'Cross-Chain Bridge',
        notSupported: 'Nepodporuje túto trasu',
      }
    : {
        title: 'SWAP Scanner',
        sub: 'Compare aggregators and swap manually where you get the most.',
        from: 'From (source)', to: 'To (destination)', amount: 'Amount', best: 'BEST VALUE / LOWEST FEE',
        scan: 'Scanning protocols…', expected: 'Expected output', netFee: 'Network + gas',
        bridgeFee: 'Bridge fee', time: 'Time', cta: 'Go to',
        all: 'All platforms (sorted by net output)',
        info: 'This tool scans aggregators and bridges to find the best rate. Clicking the button will securely redirect you to the selected platform to complete the swap using your own wallet. No transactions happen here.',
        invalid: 'Pick two different tokens.', enter: 'Enter an amount to scan protocols.',
        sameChain: 'Same-Chain Swap', crossChain: 'Cross-Chain Bridge',
        notSupported: 'Not Supported for this route',
      };

  const SwapTypeBadge = ({ type }: { type: typeof swapType }) => (
    <span
      className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[9px] font-bold tracking-wider uppercase border ${
        type === 'same-chain'
          ? 'border-primary/40 bg-primary/10 text-primary'
          : 'border-amber-500/40 bg-amber-500/10 text-amber-400'
      }`}
    >
      [{type === 'same-chain' ? t.sameChain : t.crossChain}]
    </span>
  );

  return (
    <div className="space-y-3">
      <header className="space-y-1">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-primary" />
          <h1 className="text-base font-bold tracking-tight">{t.title}</h1>
          <button
            onClick={() => setShowInfo(s => !s)}
            className="ml-auto p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/40"
            aria-label="info"
          >
            <Info className="w-3.5 h-3.5" />
          </button>
        </div>
        <p className="text-[11px] text-muted-foreground leading-snug">{t.sub}</p>
        {showInfo && (
          <div className="rounded-md border border-primary/30 bg-primary/5 p-2 text-[11px] text-foreground/80 leading-snug">
            {t.info}
          </div>
        )}
      </header>

      {/* Selector card */}
      <Card className="p-3 space-y-3 bg-card/60 backdrop-blur border-border/60">
        <AssetSelector label={t.from} value={from} onChange={setFrom} />
        <div className="flex justify-center -my-1">
          <button
            onClick={handleSwitch}
            className="h-7 w-7 rounded-full border border-border bg-background flex items-center justify-center text-muted-foreground hover:text-primary hover:border-primary transition-colors"
            aria-label="switch"
          >
            <ArrowUpDown className="w-3.5 h-3.5" />
          </button>
        </div>
        <AssetSelector label={t.to} value={to} onChange={setTo} />

        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{t.amount}</span>
            <span className="text-[10px] text-muted-foreground">≈ {formatUsd(fromUsd)}</span>
          </div>
          <Input
            type="number"
            inputMode="decimal"
            value={amountStr}
            onChange={(e) => setAmountStr(e.target.value)}
            placeholder="0.00"
            className="h-11 text-base font-mono font-semibold bg-background/60"
          />
        </div>

        {!sameToken && (
          <div className="flex items-center justify-between pt-1 border-t border-border/40">
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Route type</span>
            <SwapTypeBadge type={liveSwapType} />
          </div>
        )}
      </Card>

      {/* Result */}
      {sameToken ? (
        <Card className="p-4 text-center text-xs text-muted-foreground">{t.invalid}</Card>
      ) : !amount ? (
        <Card className="p-4 text-center text-xs text-muted-foreground">{t.enter}</Card>
      ) : scanning ? (
        <div className="space-y-2">
          <Card className="p-4 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs text-primary">
                <Search className="w-3.5 h-3.5 animate-pulse" />
                <span className="font-semibold animate-pulse">{t.scan}</span>
              </div>
              <SwapTypeBadge type={liveSwapType} />
            </div>
            <Skeleton className="h-6 w-2/3" />
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-9 w-full" />
          </Card>
          <div className="grid gap-1.5">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        </div>
      ) : best ? (
        <>
          {/* Hero card */}
          <Card className="p-3 border-emerald-500/40 bg-gradient-to-br from-emerald-500/10 via-emerald-500/5 to-transparent">
            <div className="flex items-center gap-1.5 mb-2 flex-wrap">
              <Zap className="w-3 h-3 text-emerald-400" />
              <span className="text-[9px] font-bold tracking-widest text-emerald-400">{t.best}</span>
              <span className="ml-auto"><SwapTypeBadge type={swapType} /></span>
            </div>
            <div className="flex items-baseline justify-between mb-1">
              <span className="text-lg font-bold text-foreground">{best.platformName}</span>
              <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{best.type}</span>
            </div>
            <div className="font-mono text-2xl font-bold text-emerald-400 leading-tight">
              {formatTokenAmount(best.netOut)} <span className="text-sm text-muted-foreground">{to.symbol}</span>
            </div>
            <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 mt-1.5 text-[10px] text-muted-foreground">
              <span>{t.expected}: <span className="text-foreground/80">{formatUsd(best.netOutUsd)}</span></span>
              <span>{t.netFee}: {formatUsd(best.gasUsd + best.feeUsd)}</span>
              {swapType === 'cross-chain' && (
                <>
                  <span>{t.bridgeFee}: {formatUsd(best.bridgeFeeUsd)}</span>
                  <span className="inline-flex items-center gap-1"><Clock className="w-2.5 h-2.5" />{t.time}: {formatMin(best.estTimeMin)}</span>
                </>
              )}
            </div>
            <a
              href={best.url}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-3 flex items-center justify-center gap-1.5 h-10 rounded-md bg-emerald-500 hover:bg-emerald-400 text-emerald-950 text-xs font-bold transition-colors"
            >
              {t.cta} {best.platformName} <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </Card>

          {/* Comparison table */}
          <div className="space-y-1">
            <h2 className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground px-1">{t.all}</h2>
            <Card className="divide-y divide-border/40 overflow-hidden">
              {quotes.map((q, i) => {
                const deltaPct = best && q.supported ? ((q.netOut - best.netOut) / best.netOut) * 100 : 0;
                const baseCls = `flex items-center gap-2 px-3 py-2 transition-colors ${
                  !q.supported ? 'opacity-50' : 'hover:bg-muted/30'
                } ${q.isBest ? 'bg-emerald-500/5' : ''}`;
                const inner = (
                  <>
                    <span className="text-[10px] font-mono w-5 text-muted-foreground">{q.supported ? i + 1 : '—'}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-xs font-bold text-foreground truncate">{q.platformName}</span>
                        {q.isBest && <span className="text-[8px] font-bold text-emerald-400">★</span>}
                        {q.prioritized && q.supported && !q.isBest && (
                          <span className="text-[8px] font-bold text-primary uppercase tracking-wider">priority</span>
                        )}
                        {!q.supported && (
                          <span className="inline-flex items-center gap-0.5 text-[8px] font-bold text-amber-400 uppercase tracking-wider">
                            <Ban className="w-2.5 h-2.5" />{t.notSupported}
                          </span>
                        )}
                      </div>
                      <div className="text-[10px] text-muted-foreground">
                        {q.supported
                          ? (swapType === 'cross-chain'
                              ? <>Fee {formatUsd(q.feeUsd + q.bridgeFeeUsd)} · Gas {formatUsd(q.gasUsd)} · <Clock className="inline w-2.5 h-2.5 -mt-0.5" /> {formatMin(q.estTimeMin)}</>
                              : <>Fee {formatUsd(q.feeUsd)} · Gas {formatUsd(q.gasUsd)}</>)
                          : <>—</>}
                      </div>
                    </div>
                    <div className="text-right">
                      {q.supported ? (
                        <>
                          <div className="font-mono text-xs font-semibold text-foreground">
                            {formatTokenAmount(q.netOut)} <span className="text-[9px] text-muted-foreground">{to.symbol}</span>
                          </div>
                          <div className={`text-[10px] font-medium ${q.isBest ? 'text-emerald-400' : 'text-muted-foreground'}`}>
                            {q.isBest ? '✓ best' : `${deltaPct.toFixed(2)}%`}
                          </div>
                        </>
                      ) : (
                        <span className="text-[10px] text-muted-foreground">n/a</span>
                      )}
                    </div>
                    {q.supported && <ExternalLink className="w-3 h-3 text-muted-foreground shrink-0" />}
                  </>
                );
                return q.supported ? (
                  <a key={q.platformId} href={q.url} target="_blank" rel="noopener noreferrer" className={baseCls}>
                    {inner}
                  </a>
                ) : (
                  <div key={q.platformId} className={baseCls} aria-disabled="true">
                    {inner}
                  </div>
                );
              })}
            </Card>
          </div>
        </>
      ) : null}
    </div>
  );
}

export default SwapPage;
