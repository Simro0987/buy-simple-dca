import { useEffect, useMemo, useState } from 'react';
import { ArrowDown, ArrowUpDown, ExternalLink, Info, Search, Sparkles, Zap } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  CHAINS, ChainId, TOKENS, TokenMeta, getQuotes, tokenKey, tokenUsdPrice,
  formatTokenAmount, formatUsd,
} from '@/lib/swapRoutingService';
import { usePrices } from '@/hooks/usePrices';
import { Lang } from '@/lib/i18n';

interface Props { lang: Lang; }

const CHAIN_ORDER: ChainId[] = ['base', 'ethereum', 'arbitrum', 'solana', 'native-eth', 'native-btc', 'native-sol'];

function tokensByChain(chain: ChainId) {
  return TOKENS.filter(t => t.chain === chain);
}

function AssetSelector({
  label, value, onChange,
}: { label: string; value: TokenMeta; onChange: (t: TokenMeta) => void }) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{label}</span>
      </div>
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
            <option key={tokenKey(t)} value={t.symbol}>{t.symbol}</option>
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

  // Refresh quote variance every 60s for a live feel.
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 60_000);
    return () => clearInterval(id);
  }, []);

  // Animated "Scanning protocols..." skeleton when amount/tokens change.
  useEffect(() => {
    setScanning(true);
    const id = setTimeout(() => setScanning(false), 700);
    return () => clearTimeout(id);
  }, [amountStr, from, to]);

  const amount = parseFloat(amountStr) || 0;
  const quotes = useMemo(
    () => getQuotes({ from, to, amount, prices, freshnessTick: tick }),
    [from, to, amount, prices, tick],
  );
  const best = quotes[0];

  const fromUsd = tokenUsdPrice(from, prices) * amount;
  const sameToken = from.chain === to.chain && from.symbol === to.symbol;

  const handleSwitch = () => {
    setFrom(to);
    setTo(from);
  };

  const t = lang === 'sk'
    ? {
        title: 'SWAP Skener',
        sub: 'Porovnaj 14 platforiem a swapni manuálne tam, kde dostaneš najviac.',
        from: 'Z (zdroj)', to: 'Na (cieľ)', amount: 'Suma', best: 'NAJLEPŠÍ KURZ / NAJNIŽŠÍ POPLATOK',
        scan: 'Skenujem protokoly…', expected: 'Očakávaný výstup', netFee: 'Sieťový/gas poplatok',
        cta: 'Otvoriť',
        all: 'Všetkých 14 platforiem (zoradené podľa čistého výstupu)',
        info: 'Tento nástroj skenuje 14 agregátorov a hľadá najlepší kurz. Kliknutím na tlačidlo budeš bezpečne presmerovaný na vybranú platformu, kde swap dokončíš vlastnou peňaženkou. Žiadne transakcie sa tu nevykonávajú.',
        invalid: 'Vyber dva rôzne tokeny.', enter: 'Zadaj sumu pre skenovanie protokolov.',
      }
    : {
        title: 'SWAP Scanner',
        sub: 'Compare 14 platforms and swap manually where you get the most tokens.',
        from: 'From (source)', to: 'To (destination)', amount: 'Amount', best: 'BEST VALUE / LOWEST FEE',
        scan: 'Scanning protocols…', expected: 'Expected output', netFee: 'Network / gas fee',
        cta: 'Go to',
        all: 'All 14 platforms (sorted by net output)',
        info: 'This tool scans 14 aggregators to find the best rate. Clicking the button will securely redirect you to the selected platform to complete the swap using your own wallet. No transactions happen here.',
        invalid: 'Pick two different tokens.', enter: 'Enter an amount to scan protocols.',
      };

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
      </Card>

      {/* Result */}
      {sameToken ? (
        <Card className="p-4 text-center text-xs text-muted-foreground">{t.invalid}</Card>
      ) : !amount ? (
        <Card className="p-4 text-center text-xs text-muted-foreground">{t.enter}</Card>
      ) : scanning ? (
        <div className="space-y-2">
          <Card className="p-4 space-y-2">
            <div className="flex items-center gap-2 text-xs text-primary">
              <Search className="w-3.5 h-3.5 animate-pulse" />
              <span className="font-semibold animate-pulse">{t.scan}</span>
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
            <div className="flex items-center gap-1.5 mb-2">
              <Zap className="w-3 h-3 text-emerald-400" />
              <span className="text-[9px] font-bold tracking-widest text-emerald-400">{t.best}</span>
            </div>
            <div className="flex items-baseline justify-between mb-1">
              <span className="text-lg font-bold text-foreground">{best.platformName}</span>
              <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{best.type}</span>
            </div>
            <div className="font-mono text-2xl font-bold text-emerald-400 leading-tight">
              {formatTokenAmount(best.netOut)} <span className="text-sm text-muted-foreground">{to.symbol}</span>
            </div>
            <div className="flex items-center justify-between mt-1 text-[10px] text-muted-foreground">
              <span>{t.expected}: {formatUsd(best.netOutUsd)}</span>
              <span>{t.netFee}: {formatUsd(best.gasUsd + best.feeUsd)}</span>
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
                const deltaPct = best ? ((q.netOut - best.netOut) / best.netOut) * 100 : 0;
                return (
                  <a
                    key={q.platformId}
                    href={q.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`flex items-center gap-2 px-3 py-2 transition-colors hover:bg-muted/30 ${q.isBest ? 'bg-emerald-500/5' : ''}`}
                  >
                    <span className="text-[10px] font-mono w-5 text-muted-foreground">{i + 1}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-bold text-foreground truncate">{q.platformName}</span>
                        {q.isBest && <span className="text-[8px] font-bold text-emerald-400">★</span>}
                      </div>
                      <div className="text-[10px] text-muted-foreground">
                        Fee {formatUsd(q.feeUsd)} · Gas {formatUsd(q.gasUsd)}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-mono text-xs font-semibold text-foreground">
                        {formatTokenAmount(q.netOut)} <span className="text-[9px] text-muted-foreground">{to.symbol}</span>
                      </div>
                      <div className={`text-[10px] font-medium ${i === 0 ? 'text-emerald-400' : 'text-muted-foreground'}`}>
                        {i === 0 ? '✓ best' : `${deltaPct.toFixed(2)}%`}
                      </div>
                    </div>
                    <ExternalLink className="w-3 h-3 text-muted-foreground shrink-0" />
                  </a>
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
