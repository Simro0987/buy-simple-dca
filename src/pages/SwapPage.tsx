import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowUpDown, ExternalLink, Info, Search, Sparkles, Zap, Clock, Ban, Pause, Play,
  ShieldAlert, ShieldCheck, AlertTriangle, Lock, Copy, Check, Wallet, EyeOff,
  Shield, Fuel, Flame, ArrowRight, Activity, GitBranch,
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import {
  CHAINS, CHAIN_ORDER, ChainId, TOKENS, TokenMeta, getQuotes, tokenKey, tokenUsdPrice,
  formatTokenAmount, formatUsd, formatMin, detectSwapType, involvesPrivacy, isSubmarineRoute,
  isLimitOrderChain, getGasTokenSymbol, needsGasRefuel,
  MAX_SLIPPAGE_PCT, PRICE_IMPACT_WARN_PCT, PRICE_IMPACT_UNSAFE_PCT,
  type Quote, type OrderType, type QuoteFilters, type RouteHop,
} from '@/lib/swapRoutingService';
import { usePrices } from '@/hooks/usePrices';
import { Lang } from '@/lib/i18n';

interface Props { lang: Lang; }

const REFRESH_MS = 15_000;

const tokensByChain = (chain: ChainId) => TOKENS.filter(t => t.chain === chain);

// =========================================================================
// Selector — disables chains that aren't legal for the active order type.
// =========================================================================
function AssetSelector({
  label, value, onChange, orderType,
}: { label: string; value: TokenMeta; onChange: (t: TokenMeta) => void; orderType: OrderType }) {
  const limitMode = orderType === 'limit';
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
          {CHAIN_ORDER.map(c => {
            const disabled = limitMode && !isLimitOrderChain(c);
            return (
              <option key={c} value={c} disabled={disabled}>
                {CHAINS[c].icon} {CHAINS[c].name}{disabled ? ' — n/a (Limit)' : ''}
              </option>
            );
          })}
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

// =========================================================================
// Countdown ring for the auto-refresh cycle
// =========================================================================
function CountdownRing({ progress, paused }: { progress: number; paused: boolean }) {
  const size = 22;
  const stroke = 2.5;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const offset = c * (1 - progress);
  return (
    <svg width={size} height={size} className="shrink-0" aria-hidden>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="hsl(var(--border))" strokeWidth={stroke} />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none"
        stroke={paused ? 'hsl(var(--muted-foreground))' : 'hsl(var(--primary))'}
        strokeWidth={stroke} strokeLinecap="round"
        strokeDasharray={c} strokeDashoffset={offset}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
        style={{ transition: 'stroke-dashoffset 250ms linear' }} />
    </svg>
  );
}

// =========================================================================
// Filter toggle (used in the 4–5 toggle grid)
// =========================================================================
function FilterToggle({
  icon: Icon, label, tooltip, active, onToggle,
}: { icon: typeof Wallet; label: string; tooltip: string; active: boolean; onToggle: () => void }) {
  return (
    <button
      onClick={onToggle}
      title={tooltip}
      className={`group relative h-auto min-h-[52px] rounded-md border px-2 py-1.5 text-left transition-all
        ${active
          ? 'border-primary/60 bg-primary/10 text-primary shadow-sm shadow-primary/10'
          : 'border-border bg-background/40 text-muted-foreground hover:border-border/80 hover:bg-muted/30'}`}
    >
      <div className="flex items-center gap-1.5">
        <Icon className={`w-3 h-3 ${active ? 'text-primary' : 'text-muted-foreground'}`} />
        <span className="text-[10px] font-bold uppercase tracking-wider leading-tight">{label}</span>
      </div>
      <span className={`absolute top-1.5 right-1.5 inline-block h-2 w-2 rounded-full transition-colors
        ${active ? 'bg-primary shadow-[0_0_6px] shadow-primary/60' : 'bg-muted-foreground/30'}`} />
    </button>
  );
}

// =========================================================================
// Page
// =========================================================================
export function SwapPage({ lang }: Props) {
  const { data: prices } = usePrices();

  const [orderType, setOrderType] = useState<OrderType>('market');
  const [from, setFrom] = useState<TokenMeta>(TOKENS.find(t => t.chain === 'base' && t.symbol === 'USDC')!);
  const [to, setTo] = useState<TokenMeta>(TOKENS.find(t => t.chain === 'base' && t.symbol === 'cbBTC')!);
  const [amountStr, setAmountStr] = useState<string>('100');
  const [limitTargetStr, setLimitTargetStr] = useState<string>('');
  const [initialScanning, setInitialScanning] = useState(false);
  const [tick, setTick] = useState(0);
  const [paused, setPaused] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const [copied, setCopied] = useState(false);

  // Filters
  const [filters, setFilters] = useState<QuoteFilters>({});
  const toggleFilter = (k: keyof QuoteFilters) => setFilters(s => ({ ...s, [k]: !s[k] }));

  // Polling countdown
  const [elapsed, setElapsed] = useState(0);
  const lastRef = useRef<number>(performance.now());
  useEffect(() => {
    let raf = 0;
    const loop = (now: number) => {
      const dt = now - lastRef.current;
      lastRef.current = now;
      if (!paused) {
        setElapsed(prev => {
          const next = prev + dt;
          if (next >= REFRESH_MS) { setTick(t => t + 1); return 0; }
          return next;
        });
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [paused]);

  // Brief scan placeholder for input/token changes
  useEffect(() => {
    setInitialScanning(true);
    const id = setTimeout(() => setInitialScanning(false), 600);
    return () => clearTimeout(id);
  }, [amountStr, from, to, orderType, filters]);

  useEffect(() => { setElapsed(0); }, [amountStr, from, to, orderType, filters]);

  // Order-type guard: switching to Limit forces both legs to smart-contract chains.
  useEffect(() => {
    if (orderType !== 'limit') return;
    if (!isLimitOrderChain(from.chain)) {
      setFrom(TOKENS.find(t => t.chain === 'base' && t.symbol === 'USDC')!);
    }
    if (!isLimitOrderChain(to.chain)) {
      setTo(TOKENS.find(t => t.chain === 'base' && t.symbol === 'cbBTC')!);
    }
  }, [orderType, from.chain, to.chain]);

  // Quick-pair shortcuts
  const setPair = (fc: ChainId, fs: string, tc: ChainId, ts: string) => {
    const f = TOKENS.find(x => x.chain === fc && x.symbol === fs);
    const t = TOKENS.find(x => x.chain === tc && x.symbol === ts);
    if (f && t) { setFrom(f); setTo(t); setOrderType('market'); }
  };

  const amount = parseFloat(amountStr) || 0;
  const { quotes, best, swapType, privacyRoute, submarineRoute } = useMemo(
    () => getQuotes({ from, to, amount, prices, freshnessTick: tick, orderType, filters }),
    [from, to, amount, prices, tick, orderType, filters],
  );

  const fromUsd = tokenUsdPrice(from, prices) * amount;
  const sameToken = from.chain === to.chain && from.symbol === to.symbol;
  const liveSwapType = detectSwapType(from, to);
  const livePrivacy = involvesPrivacy(from, to);
  const liveSubmarine = isSubmarineRoute(from, to);
  const showGasRefuel = !sameToken && needsGasRefuel(to);
  const destGasSymbol = getGasTokenSymbol(to.chain);

  const handleSwitch = () => { setFrom(to); setTo(from); };
  const progress = Math.min(1, elapsed / REFRESH_MS);
  const secondsLeft = Math.max(0, Math.ceil((REFRESH_MS - elapsed) / 1000));

  // Limit target — default to current market price when first switching to limit.
  const marketPriceTo = tokenUsdPrice(to, prices);
  const marketPriceFrom = tokenUsdPrice(from, prices);
  const marketRate = marketPriceTo > 0 ? marketPriceFrom / marketPriceTo : 0; // units of `to` per unit of `from`
  useEffect(() => {
    if (orderType === 'limit' && !limitTargetStr && marketRate > 0) {
      setLimitTargetStr(marketRate.toPrecision(6));
    }
    if (orderType === 'market') setLimitTargetStr('');
  }, [orderType, marketRate, limitTargetStr]);
  const applyLimitOffset = (pct: number) => {
    if (marketRate > 0) setLimitTargetStr((marketRate * (1 + pct / 100)).toPrecision(6));
  };

  // =====================================================================
  // i18n
  // =====================================================================
  const t = lang === 'sk'
    ? {
        title: 'SWAP Skener',
        sub: 'Porovnaj 26 platforiem a swapni manuálne tam, kde dostaneš najviac.',
        from: 'Z (zdroj)', to: 'Na (cieľ)', amount: 'Suma', best: 'NAJLEPŠÍ KURZ / NAJNIŽŠÍ POPLATOK',
        scan: 'Skenujem protokoly…', expected: 'Očakávaný výstup', netFee: 'Sieť + gas',
        bridgeFee: 'Bridge fee', time: 'Čas', cta: 'Otvoriť',
        all: 'Všetky platformy (zoradené podľa čistého výstupu po fee, impact a slippage)',
        info: 'Tento nástroj skenuje 26 agregátorov a bridge protokolov, aby našiel najlepší kurz. Žiadne transakcie sa tu nevykonávajú — len ťa presmeruje na platformu.',
        invalid: 'Vyber dva rôzne tokeny.', enter: 'Zadaj sumu pre skenovanie protokolov.',
        sameChain: 'Same-Chain Swap', crossChain: 'Cross-Chain Bridge',
        notSupported: 'Nepodporuje túto trasu',
        notSupportedClass: 'Nepodporované pre túto triedu aktív',
        nextIn: 'Ďalšia obnova o',
        live: 'LIVE', pausedTxt: 'POZASTAVENÉ',
        privacyTitle: 'Privacy / pomalá trasa',
        privacyNote: 'Bitcoin LN a Monero majú min. sumy (~10–25 USD) a deposit times 5–60 min. EVM agregátory túto triedu aktív nepodporujú.',
        slippageLock: `Slippage: ${MAX_SLIPPAGE_PCT.toFixed(1)}% (Max Protection)`,
        slippageNote: 'Všetky kurzy sú prepočítané s tvrdou ochranou proti sandwich útokom.',
        impact: 'Cenový dopad', impactWarn: 'Vysoký dopad', impactUnsafe: 'Vysoký dopad / Nebezpečné',
        scanSubmarine: 'Počítam Submarine Swap trasy…',
        fixedRateBadge: 'Garantovaný fixný kurz', submarineBadge: 'Submarine Route',
        submarineTitle: 'Submarine Swap (LN ↔ Polygon stables)',
        submarineNote: 'Tieto trasy používajú priame interné likvidné desky (žiadne AMM). Boltz, Exolix a FixedFloat ponúkajú zamknutý kurz s ~0% price impact a paušálnym poplatkom 0.5–1%.',
        // Order type
        market: 'Market', limit: 'Limit',
        targetPrice: 'Cieľová cena', resetMarket: 'Reset na trh',
        // Filters
        filters: 'Pro-filter prepínače',
        fCustomRecipient: 'Vlastný príjemca', fCustomRecipientT: 'Platformy umožňujúce odoslať výstup na inú adresu peňaženky.',
        fNoKyc: 'Privacy / No-KYC', fNoKycT: 'Nekustodiálne instant zmenárne bez registrácie.',
        fNoWallet: 'Bez wallet pripojenia', fNoWalletT: 'Deposit-address založené swapy — nepotrebuješ pripájať Web3 peňaženku.',
        fMev: 'MEV ochrana', fMevT: 'Privátne RPC / batch aukcie / intent architektúra — blokuje sandwich boty.',
        fOffchain: 'Off-chain (gasless)', fOffchainT: 'Iba EIP-712 signature orders — žiadny on-chain lock ani gas.',
        // Misc
        routeViz: 'Trasa',
        gasRefuel: 'Gas Refuel',
        gasWarning: (g: string, c: string) => `💡 Pozn.: Na cieľovej sieti budeš potrebovať natívny ${g} (${c}) na zaplatenie gasu pre ďalšie pohyby.`,
        copy: 'Kopírovať súhrn', copied: 'Skopírované',
        savedVs: (u: string) => `🔥 Ušetríš ${u} oproti ostatným trasám!`,
        quickPairs: 'Rýchle páry',
        limitNotice: 'Limit objednávky sú obmedzené na smart-contract siete (EVM + Solana). BTC, LN a XMR sú dočasne nedostupné.',
        mevEthBoost: 'Ethereum + MEV ochrana → CoW Swap a 1inch Fusion sú prioritizované.',
        requiresWallet: 'Vyžaduje pripojenie peňaženky', requiresSameWallet: 'Vyžaduje rovnakú peňaženku',
        kycRisk: 'Riziko KYC / registrácie', mevRisk: 'Bez MEV ochrany',
        requiresOnchain: 'Vyžaduje on-chain lock / gas', noLimitProto: 'Bez limit-order protokolu',
        notLimitChain: 'Limit vyžaduje smart-contract sieť',
        fHealthy: 'Skryť rizikové', fHealthyT: 'Vyfiltruje protokoly s incidentmi, pauzou likvidity alebo známym exploitom.',
        protocolAlert: 'Protocol Alert',
        priceVariance: 'Price Variance Warning',
        priceVarianceT: 'Kurz sa odchýlil >2% od overenej oracle ceny (LI.FI / Jupiter).',
        hopChain: 'Multi-hop trasa',
      }
    : {
        title: 'SWAP Scanner',
        sub: 'Compare 26 platforms and swap manually where you get the most.',
        from: 'From (source)', to: 'To (destination)', amount: 'Amount', best: 'BEST VALUE / LOWEST FEE',
        scan: 'Scanning protocols…', expected: 'Expected output', netFee: 'Network + gas',
        bridgeFee: 'Bridge fee', time: 'Time', cta: 'Go to',
        all: 'All platforms (sorted by net output after fees, impact & slippage)',
        info: 'This tool scans 26 aggregators and bridges to find the best rate. No transactions happen here — it just redirects you to the chosen platform.',
        invalid: 'Pick two different tokens.', enter: 'Enter an amount to scan protocols.',
        sameChain: 'Same-Chain Swap', crossChain: 'Cross-Chain Bridge',
        notSupported: 'Not Supported for this route',
        notSupportedClass: 'Not Supported for this asset class',
        nextIn: 'Next refresh in',
        live: 'LIVE', pausedTxt: 'PAUSED',
        privacyTitle: 'Privacy / slow route',
        privacyNote: 'Bitcoin LN and Monero require min. amounts (~$10–$25) and deposit times of 5–60 min. EVM aggregators do not support this asset class.',
        slippageLock: `Slippage: ${MAX_SLIPPAGE_PCT.toFixed(1)}% (Max Protection)`,
        slippageNote: 'All quotes are computed with hard sandwich-attack protection.',
        impact: 'Price Impact', impactWarn: 'High Price Impact', impactUnsafe: 'High Price Impact / Unsafe',
        scanSubmarine: 'Calculating Submarine Swap Routes…',
        fixedRateBadge: 'Guaranteed Fixed Rate', submarineBadge: 'Submarine Route',
        submarineTitle: 'Submarine Swap (LN ↔ Polygon stables)',
        submarineNote: 'These routes use direct internal liquidity desks (no AMM). Boltz, Exolix and FixedFloat offer a locked rate with ~0% price impact and a flat 0.5–1% processing fee.',
        market: 'Market', limit: 'Limit',
        targetPrice: 'Target price', resetMarket: 'Reset to market',
        filters: 'Pro-filter toggles',
        fCustomRecipient: 'Custom recipient', fCustomRecipientT: 'Platforms that allow sending output to a different wallet address.',
        fNoKyc: 'Privacy / No-KYC', fNoKycT: 'Non-custodial instant swaps with no registration.',
        fNoWallet: 'No wallet connection', fNoWalletT: 'Deposit-address based — no Web3 wallet connection required.',
        fMev: 'MEV protection', fMevT: 'Private RPC / batch auctions / intent architecture — blocks front-running.',
        fOffchain: 'Off-chain (gasless)', fOffchainT: 'EIP-712 signature orders only — no on-chain lock or gas.',
        routeViz: 'Route',
        gasRefuel: 'Gas Refuel',
        gasWarning: (g: string, c: string) => `💡 Note: You will need native ${g} on ${c} to pay gas for further movements.`,
        copy: 'Copy summary', copied: 'Copied',
        savedVs: (u: string) => `🔥 Saved ${u} compared to other routes!`,
        quickPairs: 'Quick pairs',
        limitNotice: 'Limit orders are restricted to smart-contract chains (EVM + Solana). BTC, LN and XMR are temporarily unavailable.',
        mevEthBoost: 'Ethereum + MEV protection → CoW Swap and 1inch Fusion are prioritized.',
        requiresWallet: 'Requires Wallet Connection', requiresSameWallet: 'Requires Same Wallet',
        kycRisk: 'KYC Risk / Registration Required', mevRisk: 'No MEV protection',
        requiresOnchain: 'Requires On-chain Lock/Gas', noLimitProto: 'No limit-order protocol',
        notLimitChain: 'Limit requires smart-contract chain',
        fHealthy: 'Hide risky protocols', fHealthyT: 'Filters out protocols with incidents, paused pools or known exploits.',
        protocolAlert: 'Protocol Alert',
        priceVariance: 'Price Variance Warning',
        priceVarianceT: 'Quote deviates >2% from verified oracle baseline (LI.FI / Jupiter).',
        hopChain: 'Multi-hop route',
      };

  // =====================================================================
  // Sub-components (depend on `t`)
  // =====================================================================
  const ImpactBadge = ({ q, compact = false }: { q: Quote; compact?: boolean }) => {
    if (!q.supported) return null;
    if (q.submarine) {
      return (
        <span className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[9px] font-bold tracking-wider uppercase border border-emerald-500/50 bg-emerald-500/15 text-emerald-400">
          <Lock className="w-2.5 h-2.5" />
          {q.fixedRate ? t.fixedRateBadge : t.submarineBadge} · {q.priceImpactPct.toFixed(2)}%
        </span>
      );
    }
    const pct = q.priceImpactPct;
    const cls =
      q.impactLevel === 'unsafe' ? 'border-red-500/50 bg-red-500/15 text-red-400'
      : q.impactLevel === 'warn' ? 'border-amber-500/50 bg-amber-500/15 text-amber-400'
      : 'border-border bg-muted/30 text-muted-foreground';
    const label =
      q.impactLevel === 'unsafe' ? `${t.impactUnsafe} · ${pct.toFixed(2)}%`
      : q.impactLevel === 'warn' ? `${t.impactWarn} · ${pct.toFixed(2)}%`
      : `${compact ? '' : t.impact + ': '}${pct.toFixed(2)}%`;
    return (
      <span className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[9px] font-bold tracking-wider uppercase border ${cls}`}>
        {q.impactLevel !== 'ok' && <AlertTriangle className="w-2.5 h-2.5" />}
        {label}
      </span>
    );
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

  // Translate an unsupportedReason (English key) to localized text.
  const trReason = (r?: string) => {
    if (!r) return '';
    if (r.includes('Requires Same Wallet')) return t.requiresSameWallet;
    if (r.includes('KYC')) return t.kycRisk;
    if (r.includes('Wallet Connection')) return t.requiresWallet;
    if (r.includes('MEV')) return t.mevRisk;
    if (r.includes('On-chain Lock')) return t.requiresOnchain;
    if (r.includes('limit-order')) return t.noLimitProto;
    if (r.includes('smart-contract')) return t.notLimitChain;
    if (privacyRoute) return t.notSupportedClass;
    return t.notSupported;
  };

  const copySummary = async () => {
    if (!best) return;
    const path = best.hops
      .map(h => h.kind === 'asset' ? `${h.label}${h.sub ? '·' + h.sub : ''}` : h.label)
      .join(' ➔ ');
    const summary =
      `Swap Order Summary: ${orderType === 'limit' ? 'Limit' : 'Market'} ` +
      `Exchange ${amount} ${from.symbol} (${CHAINS[from.chain].name}) → ` +
      `${formatTokenAmount(best.netOut)} ${to.symbol} (${CHAINS[to.chain].name}) via ${best.platformName}. ` +
      `Expected Net Output: ${formatUsd(best.netOutUsd)} ` +
      `[MEV Protected: ${best.mevProtected ? 'Yes' : 'No'}] ` +
      `[Execution: ${best.offchainGasless && orderType === 'limit' ? 'Off-chain' : 'On-chain'}] ` +
      `[Path: ${path}]`;
    try {
      await navigator.clipboard.writeText(summary);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch { /* ignore */ }
  };

  // Protocol-alert badge (red) — surfaces health issues.
  const HealthBadge = ({ q, compact = false }: { q: Quote; compact?: boolean }) => {
    if (!q.health || q.health === 'ok') return null;
    return (
      <span
        title={q.healthNote ?? q.health}
        className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[9px] font-bold tracking-wider uppercase border border-red-500/50 bg-red-500/15 text-red-400"
      >
        <Activity className="w-2.5 h-2.5" />
        {compact ? (q.healthNote ?? q.health) : `⚠️ ${t.protocolAlert}: ${q.healthNote ?? q.health}`}
      </span>
    );
  };

  // Price-variance badge (amber) — surfaces oracle deviation > 2%.
  const VarianceBadge = ({ q }: { q: Quote }) => {
    if (!q.priceVarianceFlag) return null;
    return (
      <span
        title={t.priceVarianceT}
        className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[9px] font-bold tracking-wider uppercase border border-amber-500/50 bg-amber-500/15 text-amber-400"
      >
        <AlertTriangle className="w-2.5 h-2.5" />
        {t.priceVariance} · {q.priceVariancePct.toFixed(2)}%
      </span>
    );
  };

  // Renders the explicit multi-hop chain for the best route.
  // Clean, wrapping flex layout. Each hop is a legible chip; arrows are
  // standalone flex items so wrapping does not break the sequence.
  const HopChain = ({ hops }: { hops: RouteHop[] }) => (
    <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1.5 text-xs font-semibold leading-none">
      {hops.map((h, idx) => (
        <React.Fragment key={idx}>
          {h.kind === 'asset' ? (
            <span className="inline-flex items-center gap-1 px-2 py-1.5 rounded-md border border-emerald-500/40 bg-emerald-500/10 text-emerald-400 whitespace-nowrap max-w-full">
              {h.icon && <span className="text-[11px]">{h.icon}</span>}
              <span className="truncate">{h.label}</span>
              {h.sub && (
                <span className="text-emerald-400/70 text-[10px] font-medium">
                  {h.sub}
                </span>
              )}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 px-2 py-1.5 rounded-md border border-primary/40 bg-primary/15 text-primary whitespace-nowrap max-w-full">
              <Sparkles className="w-3 h-3 shrink-0" />
              <span className="truncate">{h.label}</span>
            </span>
          )}
          {idx < hops.length - 1 && (
            <ArrowRight className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
          )}
        </React.Fragment>
      ))}
    </div>
  );



  // =====================================================================
  // Render
  // =====================================================================
  return (
    <div className="space-y-3">
      <header className="space-y-1">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-primary" />
          <h1 className="text-base font-bold tracking-tight">{t.title}</h1>
          <button onClick={() => setShowInfo(s => !s)}
            className="ml-auto p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/40" aria-label="info">
            <Info className="w-3.5 h-3.5" />
          </button>
        </div>
        <p className="text-[11px] text-muted-foreground leading-snug">{t.sub}</p>
        {showInfo && (
          <div className="rounded-md border border-primary/30 bg-primary/5 p-2 text-[11px] text-foreground/80 leading-snug">{t.info}</div>
        )}
      </header>

      {/* Market / Limit segmented tabs */}
      <div className="grid grid-cols-2 gap-1 p-1 rounded-lg border border-border/60 bg-background/40">
        {(['market', 'limit'] as OrderType[]).map(o => (
          <button
            key={o}
            onClick={() => setOrderType(o)}
            className={`h-8 rounded-md text-[11px] font-bold uppercase tracking-wider transition-all ${
              orderType === o
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'text-muted-foreground hover:bg-muted/40'
            }`}
          >
            {o === 'market' ? t.market : t.limit}
          </button>
        ))}
      </div>

      {orderType === 'limit' && (
        <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-2.5 py-1.5 text-[10px] text-amber-300 leading-snug flex items-start gap-1.5">
          <ShieldAlert className="w-3 h-3 mt-0.5 shrink-0" />
          <span>{t.limitNotice}</span>
        </div>
      )}

      {/* Selector card */}
      <Card className="p-3 space-y-3 bg-card/60 backdrop-blur border-border/60">
        <AssetSelector label={t.from} value={from} onChange={setFrom} orderType={orderType} />
        <div className="flex justify-center -my-1">
          <button onClick={handleSwitch}
            className="h-7 w-7 rounded-full border border-border bg-background flex items-center justify-center text-muted-foreground hover:text-primary hover:border-primary transition-colors"
            aria-label="switch">
            <ArrowUpDown className="w-3.5 h-3.5" />
          </button>
        </div>
        <AssetSelector label={t.to} value={to} onChange={setTo} orderType={orderType} />

        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{t.amount}</span>
            <span className="text-[10px] text-muted-foreground">≈ {formatUsd(fromUsd)}</span>
          </div>
          <Input type="number" inputMode="decimal" value={amountStr}
            onChange={(e) => setAmountStr(e.target.value)} placeholder="0.00"
            className="h-11 text-base font-mono font-semibold bg-background/60" />
        </div>

        {/* Limit target price */}
        {orderType === 'limit' && (
          <div className="space-y-1.5 pt-1 border-t border-border/40">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{t.targetPrice}</span>
              <span className="text-[10px] text-muted-foreground font-mono">1 {from.symbol} ≈ {marketRate ? marketRate.toPrecision(4) : '—'} {to.symbol}</span>
            </div>
            <Input type="number" inputMode="decimal" value={limitTargetStr}
              onChange={(e) => setLimitTargetStr(e.target.value)} placeholder="0.00"
              className="h-10 text-sm font-mono font-semibold bg-background/60" />
            <div className="grid grid-cols-4 gap-1">
              {[-5, -2, -1, +1].map(p => (
                <button key={p} onClick={() => applyLimitOffset(p)}
                  className={`h-7 rounded border text-[10px] font-bold transition-colors ${
                    p > 0
                      ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/15'
                      : 'border-rose-500/40 bg-rose-500/10 text-rose-400 hover:bg-rose-500/15'
                  }`}
                >
                  {p > 0 ? '+' : ''}{p}%
                </button>
              ))}
            </div>
          </div>
        )}

        {!sameToken && (
          <div className="flex items-center justify-between pt-1 border-t border-border/40 gap-2">
            <SwapTypeBadge type={liveSwapType} />
            <div className="flex items-center gap-1.5">
              <CountdownRing progress={progress} paused={paused} />
              <span className="text-[10px] font-mono tabular-nums text-muted-foreground">
                {paused ? t.pausedTxt : `${t.nextIn} ${secondsLeft}s`}
              </span>
              <button onClick={() => setPaused(p => !p)}
                className="h-6 w-6 rounded-md border border-border bg-background/60 flex items-center justify-center text-muted-foreground hover:text-primary hover:border-primary transition-colors"
                aria-label={paused ? 'play' : 'pause'}>
                {paused ? <Play className="w-3 h-3" /> : <Pause className="w-3 h-3" />}
              </button>
              <span className={`text-[9px] font-bold tracking-wider ${paused ? 'text-muted-foreground' : 'text-emerald-400'}`}>
                {paused ? '' : t.live}
              </span>
            </div>
          </div>
        )}

        {/* Locked slippage indicator */}
        <div className="flex items-center gap-1.5 pt-1 border-t border-border/40">
          <ShieldCheck className="w-3 h-3 text-emerald-400 shrink-0" />
          <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-400">{t.slippageLock}</span>
          <span className="text-[10px] text-muted-foreground truncate hidden sm:inline">· {t.slippageNote}</span>
        </div>
      </Card>

      {/* Pro-filter toggle grid */}
      <Card className="p-3 space-y-2 bg-card/60 border-border/60">
        <div className="flex items-center gap-1.5">
          <Shield className="w-3 h-3 text-primary" />
          <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{t.filters}</span>
        </div>
        <div className={`grid gap-1.5 ${orderType === 'limit' ? 'grid-cols-2 sm:grid-cols-6' : 'grid-cols-2 sm:grid-cols-5'}`}>
          <FilterToggle icon={Wallet} label={t.fCustomRecipient} tooltip={t.fCustomRecipientT}
            active={!!filters.customRecipient} onToggle={() => toggleFilter('customRecipient')} />
          <FilterToggle icon={EyeOff} label={t.fNoKyc} tooltip={t.fNoKycT}
            active={!!filters.noKyc} onToggle={() => toggleFilter('noKyc')} />
          <FilterToggle icon={Ban} label={t.fNoWallet} tooltip={t.fNoWalletT}
            active={!!filters.noWallet} onToggle={() => toggleFilter('noWallet')} />
          <FilterToggle icon={Shield} label={t.fMev} tooltip={t.fMevT}
            active={!!filters.mevProtected} onToggle={() => toggleFilter('mevProtected')} />
          <FilterToggle icon={Activity} label={t.fHealthy} tooltip={t.fHealthyT}
            active={!!filters.healthyOnly} onToggle={() => toggleFilter('healthyOnly')} />
          {orderType === 'limit' && (
            <FilterToggle icon={Lock} label={t.fOffchain} tooltip={t.fOffchainT}
              active={!!filters.offchainGasless} onToggle={() => toggleFilter('offchainGasless')} />
          )}
        </div>
        {orderType === 'market' && filters.mevProtected && from.chain === 'ethereum' && (
          <p className="text-[10px] text-emerald-400 leading-snug">⚡ {t.mevEthBoost}</p>
        )}
      </Card>

      {/* Submarine swap info */}
      {liveSubmarine && !sameToken && (
        <Card className="p-3 border-emerald-500/40 bg-emerald-500/10">
          <div className="flex items-start gap-2">
            <Lock className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
            <div className="space-y-0.5">
              <div className="text-[11px] font-bold text-emerald-400 uppercase tracking-wider">{t.submarineTitle}</div>
              <p className="text-[11px] leading-snug text-foreground/80">{t.submarineNote}</p>
            </div>
          </div>
        </Card>
      )}

      {/* Privacy warning (suppressed for submarine routes) */}
      {livePrivacy && !liveSubmarine && !sameToken && (
        <Card className="p-3 border-amber-500/40 bg-amber-500/10">
          <div className="flex items-start gap-2">
            <ShieldAlert className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <div className="space-y-0.5">
              <div className="text-[11px] font-bold text-amber-400 uppercase tracking-wider">{t.privacyTitle}</div>
              <p className="text-[11px] leading-snug text-foreground/80">{t.privacyNote}</p>
            </div>
          </div>
        </Card>
      )}

      {/* Gas Refuel warning */}
      {showGasRefuel && !sameToken && (
        <div className="rounded-md border border-amber-500/30 bg-amber-500/5 px-2.5 py-1.5 text-[11px] text-amber-300/90 leading-snug flex items-start gap-1.5">
          <Fuel className="w-3 h-3 mt-0.5 shrink-0" />
          <span>{t.gasWarning(destGasSymbol, CHAINS[to.chain].name)}</span>
        </div>
      )}

      {/* Result */}
      {sameToken ? (
        <Card className="p-4 text-center text-xs text-muted-foreground">{t.invalid}</Card>
      ) : !amount ? (
        <Card className="p-4 text-center text-xs text-muted-foreground">{t.enter}</Card>
      ) : initialScanning ? (
        <div className="space-y-2">
          <Card className="p-4 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs text-primary">
                <Search className="w-3.5 h-3.5 animate-pulse" />
                <span className="font-semibold animate-pulse">{liveSubmarine ? t.scanSubmarine : t.scan}</span>
              </div>
              <SwapTypeBadge type={liveSwapType} />
            </div>
            <Skeleton className="h-6 w-2/3" />
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-9 w-full" />
          </Card>
          <div className="grid gap-1.5">
            {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
          </div>
        </div>
      ) : best ? (
        <>
          {/* Multi-hop Route Visualizer */}
          <Card className="p-2.5 bg-card/40 border-border/60">
            <div className="flex items-center gap-1 text-[9px] uppercase tracking-widest text-muted-foreground mb-1">
              <GitBranch className="w-2.5 h-2.5" />
              <span>{swapType === 'cross-chain' ? t.hopChain : t.routeViz}</span>
            </div>
            <HopChain hops={best.hops} />
          </Card>

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
            <div className="font-mono text-2xl font-bold text-emerald-400 leading-tight transition-all">
              {formatTokenAmount(best.netOut)} <span className="text-sm text-muted-foreground">{to.symbol}</span>
            </div>
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              <ImpactBadge q={best} />
              <HealthBadge q={best} />
              <VarianceBadge q={best} />
              <span className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[9px] font-bold tracking-wider uppercase border border-emerald-500/40 bg-emerald-500/10 text-emerald-400">
                <ShieldCheck className="w-2.5 h-2.5" /> Slippage {best.slippagePct.toFixed(1)}%{best.submarine ? ' · Locked' : ''}
              </span>
              {best.mevProtected && (
                <span className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[9px] font-bold tracking-wider uppercase border border-violet-500/40 bg-violet-500/10 text-violet-400">
                  <Shield className="w-2.5 h-2.5" /> MEV
                </span>
              )}
              {best.gasRefuel && (
                <span className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[9px] font-bold tracking-wider uppercase border border-sky-500/40 bg-sky-500/10 text-sky-400">
                  <Fuel className="w-2.5 h-2.5" /> {t.gasRefuel}
                </span>
              )}
              {orderType === 'limit' && best.offchainGasless && (
                <span className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[9px] font-bold tracking-wider uppercase border border-primary/40 bg-primary/10 text-primary">
                  <Lock className="w-2.5 h-2.5" /> Off-chain
                </span>
              )}
            </div>
            {!!best.savedVsMedianUsd && best.savedVsMedianUsd > 0.05 && (
              <div className="mt-2 inline-flex items-center gap-1 rounded px-2 py-1 text-[10px] font-bold border border-emerald-500/50 bg-emerald-500/15 text-emerald-300">
                <Flame className="w-3 h-3" />
                {t.savedVs(formatUsd(best.savedVsMedianUsd))}
              </div>
            )}
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
            <div className="mt-3 grid grid-cols-[1fr_auto] gap-1.5">
              <a href={best.url} target="_blank" rel="noopener noreferrer"
                className="flex items-center justify-center gap-1.5 h-10 rounded-md bg-emerald-500 hover:bg-emerald-400 text-emerald-950 text-xs font-bold transition-colors">
                {t.cta} {best.platformName} <ExternalLink className="w-3.5 h-3.5" />
              </a>
              <button onClick={copySummary} title={t.copy}
                className="h-10 w-10 rounded-md border border-border bg-background/60 flex items-center justify-center text-muted-foreground hover:text-primary hover:border-primary transition-colors">
                {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              </button>
            </div>
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
                        {q.supported && q.mevProtected && (
                          <span className="text-[8px] font-bold text-violet-400 uppercase tracking-wider inline-flex items-center gap-0.5"><Shield className="w-2 h-2" />MEV</span>
                        )}
                        {q.supported && q.gasRefuel && (
                          <span className="text-[8px] font-bold text-sky-400 uppercase tracking-wider inline-flex items-center gap-0.5"><Fuel className="w-2 h-2" />Refuel</span>
                        )}
                        {q.supported && q.impactLevel !== 'ok' && <ImpactBadge q={q} compact />}
                        {q.supported && q.submarine && <ImpactBadge q={q} compact />}
                        {q.supported && <HealthBadge q={q} compact />}
                        {q.supported && <VarianceBadge q={q} />}
                        {!q.supported && (
                          <span className="inline-flex items-center gap-0.5 text-[8px] font-bold text-amber-400 uppercase tracking-wider">
                            <Ban className="w-2.5 h-2.5" />{trReason(q.unsupportedReason)}
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
                          <div
                            className={`text-[9px] font-mono tabular-nums ${
                              q.submarine ? 'text-emerald-400'
                              : q.impactLevel === 'unsafe' ? 'text-red-400'
                              : q.impactLevel === 'warn' ? 'text-amber-400'
                              : 'text-muted-foreground/70'
                            }`}
                            title={`${t.impact}: ${q.priceImpactPct.toFixed(2)}% (warn ≥${PRICE_IMPACT_WARN_PCT}%, unsafe ≥${PRICE_IMPACT_UNSAFE_PCT}%)`}
                          >
                            impact {q.priceImpactPct.toFixed(2)}%
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
                  <a key={q.platformId} href={q.url} target="_blank" rel="noopener noreferrer" className={baseCls}>{inner}</a>
                ) : (
                  <div key={q.platformId} className={baseCls} aria-disabled="true">{inner}</div>
                );
              })}
            </Card>
          </div>
        </>
      ) : null}

      {/* Quick pair shortcut pills */}
      <div className="pt-1 space-y-1.5">
        <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground px-1">{t.quickPairs}</span>
        <div className="flex flex-wrap gap-1.5">
          <button onClick={() => setPair('lightning', 'Bitcoin LN', 'polygon', 'USDT')}
            className="inline-flex items-center gap-1 h-8 px-2.5 rounded-full border border-amber-500/40 bg-amber-500/10 text-amber-300 text-[11px] font-semibold hover:bg-amber-500/20 transition-colors">
            ⚡ LN → Polygon USDT
          </button>
          <button onClick={() => setPair('base', 'USDC', 'bitcoin', 'BTC')}
            className="inline-flex items-center gap-1 h-8 px-2.5 rounded-full border border-sky-500/40 bg-sky-500/10 text-sky-300 text-[11px] font-semibold hover:bg-sky-500/20 transition-colors">
            🔵 Base USDC → BTC
          </button>
          <button onClick={() => setPair('solana', 'SOL', 'solana', 'JitoSOL')}
            className="inline-flex items-center gap-1 h-8 px-2.5 rounded-full border border-violet-500/40 bg-violet-500/10 text-violet-300 text-[11px] font-semibold hover:bg-violet-500/20 transition-colors">
            ☀️ SOL → JitoSOL
          </button>
        </div>
      </div>
    </div>
  );
}

export default SwapPage;
