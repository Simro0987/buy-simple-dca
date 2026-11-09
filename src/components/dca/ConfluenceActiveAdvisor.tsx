import { useEffect, useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { useAvgBuyPrices } from '@/hooks/useAvgBuyPrices';
import { fetchTokenPrice } from '@/lib/apiManager';

const TOKENS = ['BTC', 'ETH', 'SOL', 'LINK', 'HYPE', 'AAVE'] as const;
export type AdvisorToken = (typeof TOKENS)[number];

interface Props {
  onTokenChange?: (t: AdvisorToken) => void;
}

/** Tokeny s dostupným USDT párom na Binance. */
const BINANCE_PAIR: Partial<Record<AdvisorToken, string>> = {
  BTC: 'BTCUSDT',
  ETH: 'ETHUSDT',
  SOL: 'SOLUSDT',
  LINK: 'LINKUSDT',
  
  AAVE: 'AAVEUSDT',
};

type MarketSource = 'binance' | 'portfolio' | 'none';

interface Metrics {
  avg7d: number;
  current: number;
  alpha: number;
  market7d: number;
  reward: number;
  score: number;
  grade: string;
  source: MarketSource;
  samples: number;
  hasPosition: boolean;
  userAvg: number;
}

function computeMetrics(closes: number[], source: MarketSource, userAvg: number): Metrics {
  const avg7d = closes.reduce((s, c) => s + c, 0) / closes.length;
  const current = closes[closes.length - 1];
  const hasPosition = userAvg > 0;

  const alpha = hasPosition && avg7d > 0 ? ((avg7d - userAvg) / avg7d) * 100 : 0;
  const first = closes[0];
  const market7d = first > 0 ? ((current - first) / first) * 100 : 0;
  const reward = hasPosition ? ((current - userAvg) / userAvg) * 100 : 0;

  // Oktágon: vzdialenosť aktuálnej ceny od 7D priemeru (-5 %..+5 % → 0..100)
  const dev = avg7d > 0 ? ((current - avg7d) / avg7d) * 100 : 0;
  const score = Math.round(Math.max(0, Math.min(100, 50 + dev * 8)));

  const grade = !hasPosition ? 'Dáta nedostupné' : alpha >= 2 ? 'A' : alpha >= 0 ? 'B' : alpha >= -2 ? 'C' : 'D';

  return {
    avg7d, current, alpha, market7d, reward, score, grade,
    source, samples: closes.length, hasPosition, userAvg,
  };
}

async function loadCloses(
  token: AdvisorToken,
): Promise<{ closes: number[]; source: MarketSource }> {
  const pair = BINANCE_PAIR[token];
  if (pair) {
    try {
      const res = await fetch(
        `https://api.binance.com/api/v3/klines?symbol=${pair}&interval=1d&limit=7`,
      );
      if (res.ok) {
        const rows = (await res.json()) as unknown[][];
        const closes = rows.map(r => parseFloat(String(r[4]))).filter(n => Number.isFinite(n) && n > 0);
        if (closes.length >= 2) return { closes, source: 'binance' };
      }
    } catch { /* fallback nižšie */ }
  }

  // Fallback: živá cena z portfóliového price enginu (žiadne statické mocky).
  try {
    const live = await fetchTokenPrice(token);
    if (Number.isFinite(live) && live > 0) return { closes: [live], source: 'portfolio' };
  } catch { /* nedostupné */ }

  return { closes: [], source: 'none' };
}

function pct(v: number): string {
  return `${v >= 0 ? '+' : ''}${v.toFixed(1).replace('.', ',')}%`;
}

function money(v: number): string {
  const digits = v >= 100 ? 0 : v >= 1 ? 2 : 4;
  return `$${v.toFixed(digits).replace('.', ',')}`;
}

function toneFor(v: number): string {
  if (v > 0) return 'text-emerald-400';
  if (v < 0) return 'text-rose-400';
  return 'text-foreground';
}

function scoreTone(score: number): string {
  if (score < 40) return 'text-emerald-400';
  if (score > 70) return 'text-rose-400';
  return 'text-blue-400';
}

function gradeTone(grade: string): string {
  switch (grade) {
    case 'A':
      return 'text-emerald-400';
    case 'B':
      return 'text-lime-400';
    case 'C':
      return 'text-amber-400';
    default:
      return 'text-orange-400';
  }
}

function StatBox({ label, value, tone, sub }: { label: string; value: string; tone: string; sub?: string }) {
  return (
    <div className="rounded-xl bg-secondary/40 border border-border/40 p-3">
      <p className="text-[9px] uppercase tracking-[0.12em] text-muted-foreground font-semibold">{label}</p>
      <p className={`mt-1 text-2xl font-bold tabular-nums leading-tight break-words ${tone}`}>{value}</p>
      {sub && <p className="mt-1 text-[9px] text-muted-foreground">{sub}</p>}
    </div>
  );
}

export function ConfluenceActiveAdvisor({ onTokenChange }: Props) {
  const [selectedToken, setSelectedToken] = useState<AdvisorToken>('BTC');
  const [market, setMarket] = useState<{ closes: number[]; source: MarketSource } | null>(null);
  const [loading, setLoading] = useState(true);

  const { data: avgPrices, isLoading: avgLoading } = useAvgBuyPrices();
  const userAvg = avgPrices?.[selectedToken]?.avgPrice ?? 0;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    loadCloses(selectedToken).then(m => {
      if (!cancelled) {
        setMarket(m);
        setLoading(false);
      }
    });
    return () => { cancelled = true; };
  }, [selectedToken]);

  const perf = useMemo(
    () => (market && market.closes.length > 0 ? computeMetrics(market.closes, market.source, userAvg) : null),
    [market, userAvg],
  );
  const busy = loading || avgLoading;
  const unavailable = !busy && !!market && market.closes.length === 0;

  const advisorText = useMemo(() => {
    if (busy) return 'Načítavam trhové dáta…';
    if (unavailable || !perf) {
      return `Dáta pre ${selectedToken} nie sú dostupné. Skontrolujte zostatky v Portfóliu.`;
    }
    if (!perf.hasPosition) {
      return `${selectedToken}: Zatiaľ nevlastníte tento token. Vykonajte prvý nákup pre spustenie Self-Learning enginu.`;
    }
    if (perf.score <= 30) return `${selectedToken}: cena pod 7D priemerom — silné okno na akumuláciu.`;
    if (perf.score >= 70) return `${selectedToken}: cena nad 7D priemerom — zvážte limitné objednávky pod spot.`;
    return `${selectedToken}: neutrálna zóna — pokračujte v štandardnom DCA pláne.`;
  }, [perf, selectedToken, busy, unavailable]);


  function selectToken(t: AdvisorToken) {
    setSelectedToken(t);
    onTokenChange?.(t);
  }

  return (
    <div className="glass-card p-4 space-y-4">
      {/* Header */}
      <div>
        <p className="text-[9px] uppercase tracking-[0.14em] text-muted-foreground font-semibold">
          Confluence Octagon &amp; Active Advisor
        </p>
        <h2 className="text-xl font-bold text-foreground mt-1 leading-tight">
          {selectedToken} • {selectedToken}
        </h2>
        <p className="text-[10px] text-muted-foreground mt-0.5 leading-snug">
          Živé dáta z Binance (7D sviece) • porovnané s vašou Ø nákupnou cenou
        </p>
      </div>

      {/* Octagon score box */}
      <div className="rounded-xl bg-secondary/40 border border-border/40 p-3 space-y-3">
        <div>
          <p className="text-[9px] uppercase tracking-[0.14em] text-muted-foreground font-semibold">Oktágon</p>
          {busy || !perf ? (
            <div className="flex items-center gap-2 mt-1 text-amber-400">
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              <span className="text-xs">{busy ? 'Načítavam...' : 'Dáta nedostupné'}</span>
            </div>
          ) : (
            <p className={`text-3xl font-bold tabular-nums leading-none mt-1 ${scoreTone(perf.score)}`}>
              {perf.score}
              <span className="text-sm text-muted-foreground font-normal">/100</span>
            </p>
          )}
        </div>

        <div className="flex flex-wrap gap-1.5">
          {TOKENS.map(t => (
            <button
              key={t}
              onClick={() => selectToken(t)}
              className={`px-3 py-1.5 rounded-full text-[11px] font-bold transition-all active:scale-95 ${
                selectedToken === t
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-secondary/70 text-muted-foreground hover:text-foreground'
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        {unavailable && (
          <p className="text-[10px] font-semibold text-amber-400">
            Dáta pre {selectedToken} nie sú dostupné. Skontrolujte zostatky v Portfóliu.
          </p>
        )}

        {perf && !busy && (
          <p className={`text-[10px] font-semibold ${scoreTone(perf.score)}`}>
            Skóre akumulácie {perf.score}/100 • spot {money(perf.current)} vs 7D Ø {money(perf.avg7d)}
            {perf.source === 'portfolio' && ' • cena z portfólia (bez Binance páru)'}
          </p>
        )}
      </div>

      {/* Execution performance */}
      <div className="space-y-2">
        <p className="text-[9px] uppercase tracking-[0.14em] text-muted-foreground font-semibold">
          Execution Performance
        </p>
        {unavailable ? (
          <div className="rounded-xl bg-secondary/40 border border-amber-500/30 p-3">
            <p className="text-[11px] text-amber-300/90 leading-snug">
              Dáta pre {selectedToken} nie sú dostupné. Skontrolujte zostatky v Portfóliu.
            </p>
          </div>
        ) : busy || !perf ? (
          <div className="grid grid-cols-2 gap-2">
            {[0, 1, 2, 3].map(i => (
              <div key={i} className="rounded-xl bg-secondary/40 border border-border/40 p-3 h-[74px] animate-pulse" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            <StatBox
              label="Alpha vs Market"
              value={perf.hasPosition ? pct(perf.alpha) : 'Dáta nedostupné'}
              tone={perf.hasPosition ? toneFor(perf.alpha) : 'text-amber-400'}
              sub={perf.hasPosition ? undefined : 'bez pozície'}
            />
            <StatBox
              label="7D Market DCA"
              value={pct(perf.market7d)}
              tone={toneFor(perf.market7d)}
              sub={`Ø ${money(perf.avg7d)}`}
            />
            <StatBox
              label="Ø Reward"
              value={perf.hasPosition ? pct(perf.reward) : 'Dáta nedostupné'}
              tone={perf.hasPosition ? toneFor(perf.reward) : 'text-amber-400'}
              sub={perf.hasPosition ? `Ø nákup ${money(perf.userAvg)}` : 'žiadny nákup'}
            />
            <StatBox
              label="Efficiency Grade"
              value={perf.grade}
              tone={perf.hasPosition ? gradeTone(perf.grade) : 'text-amber-400'}
              sub={`n=${perf.samples} dní`}
            />
          </div>
        )}

      </div>

      {/* Active advisor */}
      <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3">
        <p className="text-[9px] uppercase tracking-[0.14em] text-emerald-400 font-semibold">Active Advisor</p>
        <p className="text-[11px] text-emerald-100/80 mt-1 leading-snug">{advisorText}</p>
      </div>
    </div>
  );
}
