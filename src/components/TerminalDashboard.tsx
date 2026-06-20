/**
 * TerminalDashboard — Hlavná stránka (Edge Trader Terminal štýl)
 * Celý vizuál + DCA-Out Radar sú inline – žiadne externé komponenty okrem
 * Octagon, MacroNewsTicker a LiquidationAlertBanner.
 */
import { useState, useCallback, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  PieChart, Calculator, Shield, Activity, BarChart3, DollarSign,
  Coins, Settings, Wallet, TrendingUp, TrendingDown, Briefcase,
  BarChart2, RefreshCw, Target, Zap, ArrowRight, ShieldCheck,
  AlertTriangle, ChevronDown, ChevronUp, Lock, RotateCcw,
} from 'lucide-react';
import { TabId } from '@/components/BottomNav';
import { ConfluenceOctagon } from '@/components/ConfluenceOctagon';
import { MacroNewsTicker } from '@/components/MacroNewsTicker';
import { LiquidationAlertBanner } from '@/components/LiquidationAlertBanner';
import { usePrices } from '@/hooks/usePrices';
import { usePortfolioMetrics } from '@/hooks/usePortfolioMetrics';
import { formatUsd, formatPrice, TOKENS } from '@/lib/crypto';
import { Lang } from '@/lib/i18n';
import type { OctToken } from '@/hooks/useConfluenceMetrics';

interface Props { onNavigate: (tab: TabId) => void; lang: Lang }

// ─── design tokens ────────────────────────────────────────────────────────────
const T = {
  card:      'rgba(17,24,39,0.90)',
  cardHover: 'rgba(22,32,52,0.95)',
  border:    'rgba(255,255,255,0.07)',
  teal:      '#0ea5e9', tealBg:  'rgba(14,165,233,0.11)',
  green:     '#10b981', greenBg: 'rgba(16,185,129,0.11)',
  red:       '#ef4444', redBg:   'rgba(239,68,68,0.11)',
  amber:     '#f59e0b', amberBg: 'rgba(245,158,11,0.11)',
  text:      '#f1f5f9',
  textSub:   'rgba(148,163,184,0.70)',
  textMuted: 'rgba(100,116,139,0.55)',
  r:         '10px',
  rs:        '7px',
};

const CARD  = (extra?: React.CSSProperties): React.CSSProperties =>
  ({ background: T.card, border: `1px solid ${T.border}`, borderRadius: T.r, padding: 12, ...extra });
const IBOX  = (bg: string): React.CSSProperties =>
  ({ width: 28, height: 28, borderRadius: 8, background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 8 });

function Pill({ label, color, bg }: { label: string; color: string; bg: string }) {
  return (
    <span style={{ fontSize: 8.5, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase' as const,
      padding: '2px 6px', borderRadius: 4, color, background: bg }}>
      {label}
    </span>
  );
}

// ─── module nav ───────────────────────────────────────────────────────────────
const MODULES: { id: TabId; label: string; icon: typeof PieChart }[] = [
  { id: 'portfolio', label: 'Portfólio', icon: PieChart   },
  { id: 'dca',       label: 'DCA',       icon: Calculator },
  { id: 'risk',      label: 'Riziko',    icon: Shield     },
  { id: 'analysis',  label: 'Analýza',   icon: Activity   },
  { id: 'market',    label: 'Trh',       icon: BarChart3  },
  { id: 'profit',    label: 'Zisky',     icon: DollarSign },
  { id: 'staking',   label: 'Staking',   icon: Coins      },
  { id: 'wallets',   label: 'Wallety',   icon: Wallet     },
  { id: 'settings',  label: 'Nastav.',   icon: Settings   },
];

// ─── localStorage helpers ─────────────────────────────────────────────────────
type DcaT = 'BTC' | 'ETH' | 'SOL';

function loadInvested(): number {
  try { return parseFloat(localStorage.getItem('total-invested') || '0') || 0; } catch { return 0; }
}
function loadFreeCash(): number {
  try { return parseFloat(localStorage.getItem('free-cash') || '0') || 0; } catch { return 0; }
}
function loadDcaPrices(): Record<DcaT, number> {
  try { const s = JSON.parse(localStorage.getItem('dca-out-avg-prices-v1') || '{}'); return { BTC: 0, ETH: 0, SOL: 0, ...s }; }
  catch { return { BTC: 0, ETH: 0, SOL: 0 }; }
}
function saveDcaPrices(p: Record<DcaT, number>) {
  try { localStorage.setItem('dca-out-avg-prices-v1', JSON.stringify(p)); } catch { /* quota */ }
}
function loadCooldown(): Record<string, number> {
  try { return JSON.parse(localStorage.getItem('dca-out-cooldown-v1') || '{}'); } catch { return {}; }
}
function saveCooldown(c: Record<string, number>) {
  try { localStorage.setItem('dca-out-cooldown-v1', JSON.stringify(c)); } catch { /* quota */ }
}
function loadHoldings(): Record<string, number> {
  try { return JSON.parse(localStorage.getItem('smart-alloc-holdings') || '{}'); } catch { return {}; }
}

// ─── RSI helper ───────────────────────────────────────────────────────────────
function calcRSI(closes: number[]): number {
  const p = 14;
  if (closes.length < p + 1) return 50;
  const sl = closes.slice(-(p + 1));
  let g = 0, l = 0;
  for (let i = 1; i < sl.length; i++) { const d = sl[i] - sl[i-1]; d > 0 ? g += d : l -= d; }
  const ag = g / p, al = l / p;
  if (al === 0) return 99;
  return Math.round(Math.max(0, Math.min(100, 100 - 100 / (1 + ag / al))));
}

// ─── Binance + F&G fetch ──────────────────────────────────────────────────────
async function fetchRadar() {
  async function ft(sym: string) {
    try {
      const ctrl = new AbortController(); setTimeout(() => ctrl.abort(), 10000);
      const r = await fetch(`https://api.binance.com/api/v3/klines?symbol=${sym}&interval=1d&limit=30`, { signal: ctrl.signal });
      if (!r.ok) return { price: 0, rsi: 50 };
      const d = await r.json() as [number,string,string,string,string,string,...unknown[]][];
      const c = d.map(k => parseFloat(k[4]));
      return { price: c[c.length - 1], rsi: calcRSI(c) };
    } catch { return { price: 0, rsi: 50 }; }
  }
  async function fg() {
    try {
      const ctrl = new AbortController(); setTimeout(() => ctrl.abort(), 8000);
      const r = await fetch('https://api.alternative.me/fng/?limit=1', { signal: ctrl.signal });
      const j = await r.json() as { data: { value: string }[] };
      return parseInt(j.data[0].value, 10);
    } catch { return 50; }
  }
  const [btc, eth, sol, fgv] = await Promise.allSettled([ft('BTCUSDT'), ft('ETHUSDT'), ft('SOLUSDT'), fg()]);
  return {
    btc: btc.status === 'fulfilled' ? btc.value : { price: 0, rsi: 50 },
    eth: eth.status === 'fulfilled' ? eth.value : { price: 0, rsi: 50 },
    sol: sol.status === 'fulfilled' ? sol.value : { price: 0, rsi: 50 },
    fg:  fgv.status === 'fulfilled' ? fgv.value : 50,
  };
}

// ─── Trigger logic ────────────────────────────────────────────────────────────
function evalTrigger(rsi: number, fg: number) {
  if (fg > 85)          return { s: 'D' as const, pct: 15, label: 'Scenár D · Extrémne FOMO (F&G > 85)'   };
  if (fg >= 70)         return { s: 'C' as const, pct: 10, label: 'Scenár C · Vysoká eufória (F&G 70–85)'  };
  if (fg >= 55)         return { s: 'B' as const, pct: 5,  label: 'Scenár B · Mierna eufória (F&G 55–70)'  };
  if (fg < 55 && rsi > 75) return { s: 'A' as const, pct: rsi > 82 ? 10 : 5, label: `Scenár A · Lokálna pumpa (RSI ${rsi})` };
  return { s: null as null, pct: 0, label: '' };
}

const TOKEN_COLOR: Record<DcaT, string> = { BTC: '#F7931A', ETH: '#627EEA', SOL: '#9945FF' };
const TOKEN_SOURCES: Record<DcaT, string[]> = {
  BTC: ['Hardware Wallet (Native BTC)'],
  ETH: ['Natívne ETH', 'rETH (Rocket Pool)', 'wstETH / weETH (ether.fi – Arbitrum)'],
  SOL: ['Natívne SOL', 'Marinade Native', 'INF (Sanctum)'],
};
const TOKEN_HOLD_KEY: Record<DcaT, string> = { BTC: 'btc', ETH: 'eth', SOL: 'sol' };
const DEFAULT_HOLD: Record<DcaT, number>   = { BTC: 0.0323276, ETH: 0.527723, SOL: 0 };

// ─── DCA-Out token row card ───────────────────────────────────────────────────
function DcaTokenCard({
  sym, price, rsi, fg, dcaPrice, onDcaChange,
}: {
  sym: DcaT; price: number; rsi: number; fg: number;
  dcaPrice: number; onDcaChange: (v: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const tc = TOKEN_COLOR[sym];
  const holdings = loadHoldings();
  const hold      = holdings[TOKEN_HOLD_KEY[sym]] ?? DEFAULT_HOLD[sym];
  const pnlPct    = dcaPrice > 0 && price > 0 ? ((price - dcaPrice) / dcaPrice) * 100 : 0;
  const pnlGuard  = dcaPrice > 0 && pnlPct >= 20;
  const trigger   = evalTrigger(rsi, fg);
  const sellQtyRaw = hold * (trigger.pct / 100);
  const maxSell    = hold * 0.85;
  const sellQty    = Math.min(sellQtyRaw, maxSell);
  const moonOk     = sellQty > 0 && sellQtyRaw <= maxSell;
  const cd         = loadCooldown();
  const cdPrice    = cd[sym] ?? 0;
  const cdActive   = cdPrice > 0 && price < cdPrice * 1.05;

  const status: 'ACCUMULATE' | 'HOLD' | 'SELL' =
    !pnlGuard              ? 'ACCUMULATE' :
    !trigger.s || cdActive || !moonOk ? 'HOLD' :
    'SELL';

  const statusColor = status === 'SELL' ? T.red : status === 'HOLD' ? T.teal : T.green;
  const statusBg    = status === 'SELL' ? T.redBg : status === 'HOLD' ? T.tealBg : T.greenBg;

  return (
    <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: T.r, borderLeft: `2px solid ${tc}`, overflow: 'hidden' }}>
      {/* Header row — always visible */}
      <button onClick={() => setOpen(v => !v)} style={{
        width: '100%', background: 'transparent', border: 'none', cursor: 'pointer',
        padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 8,
      }}>
        <span style={{ fontSize: 10, fontWeight: 800, color: tc, background: `${tc}18`,
          border: `1px solid ${tc}30`, borderRadius: 5, padding: '2px 7px', letterSpacing: '0.05em', flexShrink: 0 }}>
          {sym}
        </span>
        <span style={{ fontSize: 9, fontWeight: 700, color: statusColor, background: statusBg,
          border: `1px solid ${statusColor}40`, borderRadius: 5, padding: '3px 8px',
          display: 'flex', alignItems: 'center', gap: 3 }}>
          {status === 'SELL' ? <Zap size={9}/> : <ShieldCheck size={9}/>} {status}
        </span>
        <span style={{ flex: 1 }} />
        {price > 0 && (
          <span style={{ fontSize: 11, fontWeight: 700, color: T.text, fontVariantNumeric: 'tabular-nums' }}>
            ${price.toLocaleString('en-US', { maximumFractionDigits: 0 })}
          </span>
        )}
        {dcaPrice > 0 && price > 0 && (
          <span style={{ fontSize: 10, fontWeight: 700, color: pnlPct >= 0 ? T.green : T.red, fontVariantNumeric: 'tabular-nums' }}>
            {pnlPct >= 0 ? '+' : ''}{pnlPct.toFixed(1)}%
          </span>
        )}
        {open ? <ChevronUp size={12} style={{ color: T.textMuted, flexShrink: 0 }} />
               : <ChevronDown size={12} style={{ color: T.textMuted, flexShrink: 0 }} />}
      </button>

      {/* Expandable detail */}
      {open && (
        <div style={{ padding: '0 12px 12px', borderTop: `1px solid ${T.border}` }}>
          {/* Indicators row */}
          <div style={{ display: 'flex', gap: 6, marginTop: 10, marginBottom: 10, flexWrap: 'wrap' as const }}>
            <Pill label={`RSI(14d) ${rsi}`} color={rsi > 75 ? T.red : rsi < 35 ? T.green : T.teal}
              bg={rsi > 75 ? T.redBg : rsi < 35 ? T.greenBg : T.tealBg} />
            <Pill label={`F&G ${fg}`} color={fg > 70 ? T.red : fg < 35 ? T.green : T.amber}
              bg={fg > 70 ? T.redBg : fg < 35 ? T.greenBg : T.amberBg} />
            <Pill label={`${hold.toPrecision(4)} ${sym}`} color={T.textSub} bg="rgba(255,255,255,0.05)" />
          </div>

          {/* DCA price input */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <span style={{ fontSize: 9, color: T.textMuted, flexShrink: 0 }}>DCA cena $</span>
            <input type="number" min="0" step="0.01" value={dcaPrice || ''} placeholder="0.00"
              onChange={e => onDcaChange(parseFloat(e.target.value) || 0)}
              style={{ flex: 1, background: 'rgba(255,255,255,0.04)', border: `1px solid ${T.border}`,
                borderRadius: 6, color: T.text, fontSize: 11, fontWeight: 600, padding: '4px 8px',
                outline: 'none', fontVariantNumeric: 'tabular-nums', maxWidth: 130 }} />
          </div>

          {/* Guards */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 10 }}>
            {[
              { ok: pnlGuard, label: dcaPrice > 0 ? `PnL Guard: ${pnlPct >= 0 ? '+' : ''}${pnlPct.toFixed(1)}% ${pnlGuard ? '≥ +20% ✓' : '– min. +20% potrebné'}` : 'PnL Guard: nastav DCA cenu' },
              { ok: !cdActive, label: cdActive ? `Cooldown: čakám na +5% od $${cdPrice.toLocaleString('en-US',{maximumFractionDigits:0})}` : 'Cooldown: voľný ✓' },
              { ok: moonOk || status !== 'SELL', label: `Moon-Bag: min. 15% (${(hold * 0.15).toPrecision(4)} ${sym}) zostane` },
            ].map(g => (
              <div key={g.label} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                {g.ok ? <ShieldCheck size={10} style={{ color: T.green, flexShrink: 0 }} />
                      : <AlertTriangle size={10} style={{ color: T.amber, flexShrink: 0 }} />}
                <span style={{ fontSize: 9.5, color: g.ok ? T.green : T.amber }}>{g.label}</span>
              </div>
            ))}
          </div>

          {/* HOLD / ACCUMULATE message */}
          {status !== 'SELL' && (
            <div style={{ background: status === 'ACCUMULATE' ? T.greenBg : T.tealBg,
              border: `1px solid ${status === 'ACCUMULATE' ? T.green : T.teal}30`,
              borderRadius: T.rs, padding: '8px 10px' }}>
              <p style={{ fontSize: 10, color: status === 'ACCUMULATE' ? T.green : T.teal, fontWeight: 600 }}>
                {status === 'ACCUMULATE'
                  ? `STATUS: ${sym} AKUMULÁCIA / HOLD — nespĺňa podmienku min. +20% zisku.`
                  : `STATUS: ${sym} HOLD — žiadny aktívny trigger. Poistky OK.`}
              </p>
            </div>
          )}

          {/* SELL execution block */}
          {status === 'SELL' && (
            <div style={{ background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.22)',
              borderRadius: T.rs, padding: '10px 12px', marginTop: 4 }}>
              <p style={{ fontSize: 9, fontWeight: 800, color: T.red, marginBottom: 8, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                ⚡ {trigger.label}
              </p>
              {[
                { ico: '🔴', lbl: 'AKCIA',      val: `Predaj presne ${sellQty.toPrecision(5).replace(/\.?0+$/,'')} ${sym}  (${trigger.pct}% pozície)` },
                { ico: '📂', lbl: 'ZDROJ',      val: TOKEN_SOURCES[sym].join(' / ') },
                { ico: '🎯', lbl: 'CIEĽ',       val: 'Zameň za crvUSD → Profit Reservoir (Arbitrum)' },
                { ico: '⚡', lbl: 'STRATÉGIA',  val: 'Zisk pripravený na budúci Limit Buy BTC' },
              ].map(row => (
                <div key={row.lbl} style={{ display: 'flex', alignItems: 'flex-start', gap: 6, marginBottom: 5, fontSize: 10 }}>
                  <span style={{ fontSize: 12, lineHeight: 1, marginTop: 1, flexShrink: 0 }}>{row.ico}</span>
                  <span style={{ color: T.textMuted, fontWeight: 700, minWidth: 72, flexShrink: 0 }}>{row.lbl}:</span>
                  <span style={{ color: T.text, lineHeight: 1.35 }}>{row.val}</span>
                </div>
              ))}
              <button onClick={() => {
                const c = loadCooldown(); c[sym] = price; saveCooldown(c);
                setOpen(false);
              }} style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 5,
                background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.30)',
                borderRadius: 5, padding: '5px 10px', color: T.red, fontSize: 9, fontWeight: 700, cursor: 'pointer' }}>
                <Lock size={9} /> Potvrď predaj → Aktivuj cooldown
              </button>
            </div>
          )}

          {cdActive && (
            <button onClick={() => {
              const c = loadCooldown(); delete c[sym]; saveCooldown(c);
            }} style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 5,
              background: 'transparent', border: `1px solid ${T.border}`,
              borderRadius: 5, padding: '4px 8px', color: T.textMuted, fontSize: 9, cursor: 'pointer' }}>
              <RotateCcw size={9} /> Resetuj cooldown manuálne
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ─── main component ───────────────────────────────────────────────────────────
export function TerminalDashboard({ onNavigate, lang }: Props) {
  const { data: prices, isFetching, refetch } = usePrices();
  const metrics   = usePortfolioMetrics(prices);
  const [octagonToken, setOctagonToken] = useState<OctToken>('BTC');

  /* Portfolio stats */
  const invested   = loadInvested();
  const [freeCash, setFreeCash] = useState(loadFreeCash);
  const totalValue = metrics.totalValue;
  const pnlUsd     = totalValue - invested;
  const pnlPct     = invested > 0 ? (pnlUsd / invested) * 100 : 0;
  const pnlPos     = pnlUsd >= 0;

  /* DCA-Out Radar */
  const [dcaPrices, setDcaPricesState] = useState(loadDcaPrices);
  const updateDcaPrice = useCallback((sym: DcaT, v: number) => {
    setDcaPricesState(prev => { const n = { ...prev, [sym]: v }; saveDcaPrices(n); return n; });
  }, []);

  const { data: radarData, isLoading: radarLoading, refetch: radarRefetch } = useQuery({
    queryKey: ['dca-out-radar'],
    queryFn:  fetchRadar,
    staleTime: 5 * 60 * 1000,
    refetchInterval: 10 * 60 * 1000,
    retry: 2,
  });

  const fg = radarData?.fg ?? 50;
  const radarPrices: Record<DcaT, { price: number; rsi: number }> = {
    BTC: radarData?.btc ?? { price: 0, rsi: 50 },
    ETH: radarData?.eth ?? { price: 0, rsi: 50 },
    SOL: radarData?.sol ?? { price: 0, rsi: 50 },
  };

  /* Save free cash on change */
  useEffect(() => {
    try { localStorage.setItem('free-cash', String(freeCash)); } catch { /* quota */ }
  }, [freeCash]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <LiquidationAlertBanner lang={lang} />

      {/* ────────────── PORTFÓLIO STATS ────────────── */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, paddingLeft: 2 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Briefcase size={12} style={{ color: T.textMuted }} />
            <span style={{ fontSize: 10, fontWeight: 600, color: T.textMuted, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              Moje portfólio
            </span>
          </div>
          <button onClick={() => void refetch()} style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 4 }}>
            <RefreshCw size={11} style={{ color: T.textMuted }} className={isFetching ? 'animate-spin' : ''} />
          </button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          {/* Celková hodnota */}
          <div style={CARD()}>
            <div style={IBOX(T.tealBg)}><BarChart2 size={14} style={{ color: T.teal }} /></div>
            <p style={{ fontSize: 9.5, color: T.textSub, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>Celková hodnota</p>
            <p style={{ fontSize: 19, fontWeight: 700, color: T.text, lineHeight: 1.1, fontVariantNumeric: 'tabular-nums' }}>
              {totalValue > 0 ? formatUsd(totalValue) : '$0.00'}
            </p>
            <p style={{ fontSize: 10, color: T.textMuted, marginTop: 3 }}>{metrics.assets.length} pozícií</p>
          </div>

          {/* Reálny vklad */}
          <div style={CARD()}>
            <div style={IBOX(T.tealBg)}><Wallet size={14} style={{ color: T.teal }} /></div>
            <p style={{ fontSize: 9.5, color: T.textSub, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>Reálny vklad</p>
            <p style={{ fontSize: 19, fontWeight: 700, color: T.text, lineHeight: 1.1, fontVariantNumeric: 'tabular-nums' }}>
              {invested > 0 ? formatUsd(invested) : '$0.00'}
            </p>
            <p style={{ fontSize: 10, color: T.textMuted, marginTop: 3 }}>investovaný kapitál</p>
          </div>

          {/* Zisk / strata */}
          <div style={CARD()}>
            <div style={IBOX(pnlPos ? T.greenBg : T.redBg)}>
              {pnlPos ? <TrendingUp size={14} style={{ color: T.green }} /> : <TrendingDown size={14} style={{ color: T.red }} />}
            </div>
            <p style={{ fontSize: 9.5, color: T.textSub, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>Zisk / strata</p>
            <p style={{ fontSize: 19, fontWeight: 700, lineHeight: 1.1, fontVariantNumeric: 'tabular-nums', color: pnlPos ? T.green : T.red }}>
              {pnlPos ? '+' : ''}{formatUsd(pnlUsd)}
            </p>
            <Pill label={`${pnlPos ? '+' : ''}${pnlPct.toFixed(2)}%`} color={pnlPos ? T.green : T.red} bg={pnlPos ? T.greenBg : T.redBg} />
          </div>

          {/* Zmena dnes */}
          <div style={CARD()}>
            <div style={IBOX(T.tealBg)}><BarChart3 size={14} style={{ color: T.teal }} /></div>
            <p style={{ fontSize: 9.5, color: T.textSub, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>Zmena dnes</p>
            {(() => {
              const d = metrics.assets.reduce((s, a) => {
                const ch = prices?.[TOKENS.find(t => t.symbol === a.symbol)?.coingeckoId ?? '']?.usd_24h_change ?? 0;
                return s + a.value * ch / 100;
              }, 0);
              const pos = d >= 0;
              return (
                <>
                  <p style={{ fontSize: 19, fontWeight: 700, lineHeight: 1.1, fontVariantNumeric: 'tabular-nums', color: pos ? T.green : T.red }}>
                    {pos ? '+' : ''}{formatUsd(d)}
                  </p>
                  <Pill label={pos ? 'RAST' : 'POKLES'} color={pos ? T.green : T.red} bg={pos ? T.greenBg : T.redBg} />
                </>
              );
            })()}
          </div>

          {/* Voľný cash */}
          <div style={{ ...CARD(), gridColumn: '1 / -1' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={IBOX(T.amberBg)}><DollarSign size={14} style={{ color: T.amber }} /></div>
                <div>
                  <p style={{ fontSize: 9.5, color: T.textSub, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>Voľný cash</p>
                  <p style={{ fontSize: 19, fontWeight: 700, color: T.text, lineHeight: 1.1, fontVariantNumeric: 'tabular-nums' }}>
                    {freeCash > 0 ? formatUsd(freeCash) : '$0.00'}
                  </p>
                  <p style={{ fontSize: 10, color: T.textMuted, marginTop: 3 }}>nedeployovaný kapitál / rezerva</p>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ fontSize: 9, color: T.textMuted }}>$</span>
                <input type="number" min="0" step="10" value={freeCash || ''} placeholder="0"
                  onChange={e => setFreeCash(parseFloat(e.target.value) || 0)}
                  style={{ width: 80, background: 'rgba(255,255,255,0.04)', border: `1px solid ${T.border}`,
                    borderRadius: 6, color: T.text, fontSize: 11, padding: '4px 8px',
                    outline: 'none', fontVariantNumeric: 'tabular-nums', textAlign: 'right' as const }} />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ────────────── TOKEN PRICE STRIP ────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
        {TOKENS.map(t => {
          const a   = metrics.assets.find(x => x.symbol === t.symbol);
          const ch  = prices?.[t.coingeckoId]?.usd_24h_change ?? 0;
          const pos = ch >= 0;
          return (
            <div key={t.symbol} style={{ ...CARD(), padding: 10, borderLeft: `2px solid ${t.color}` }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: T.text }}>{t.symbol}</span>
                <Pill label={`${pos ? '▲' : '▼'} ${Math.abs(ch).toFixed(1)}%`} color={pos ? T.green : T.red} bg={pos ? T.greenBg : T.redBg} />
              </div>
              <p style={{ fontSize: 12, fontWeight: 700, color: T.text, fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>
                {a ? formatPrice(a.currentPrice) : '—'}
              </p>
              <p style={{ fontSize: 9, color: T.textMuted, marginTop: 4 }}>{Math.round(t.allocation * 100)}% alok.</p>
            </div>
          );
        })}
      </div>

      {/* ────────────── DCA-OUT RADAR (Bitcoinový vysávač) ────────────── */}
      <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: T.r, overflow: 'hidden' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px',
          borderBottom: `1px solid ${T.border}`, background: 'rgba(14,165,233,0.04)' }}>
          <Target size={13} style={{ color: T.teal, flexShrink: 0 }} />
          <div style={{ flex: 1 }}>
            <p style={{ fontSize: 10, fontWeight: 800, color: T.text, textTransform: 'uppercase', letterSpacing: '0.07em', lineHeight: 1 }}>
              DCA-Out Radar · Bitcoinový vysávač
            </p>
            <p style={{ fontSize: 8.5, color: T.textMuted, marginTop: 2 }}>
              Výber ziskov → Profit Reservoir crvUSD (Arbitrum)
            </p>
          </div>
          <div style={{ textAlign: 'center' }}>
            <p style={{ fontSize: 8, color: T.textMuted, marginBottom: 2 }}>F&G</p>
            <span style={{ fontSize: 10, fontWeight: 800, fontVariantNumeric: 'tabular-nums',
              color: fg > 70 ? T.red : fg < 35 ? T.green : T.amber }}>
              {radarLoading ? '…' : fg}
            </span>
          </div>
          <button onClick={() => void radarRefetch()}
            style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: T.textMuted, padding: 3 }}>
            <RefreshCw size={11} className={radarLoading ? 'animate-spin' : ''} />
          </button>
        </div>

        {/* Info banner */}
        <div style={{ padding: '8px 12px', borderBottom: `1px solid ${T.border}`,
          display: 'flex', alignItems: 'center', gap: 6 }}>
          <ArrowRight size={10} style={{ color: T.teal, flexShrink: 0 }} />
          <p style={{ fontSize: 9, color: T.textMuted, lineHeight: 1.4 }}>
            Cieľová stanica:{' '}
            <span style={{ color: T.teal, fontWeight: 700 }}>Profit Reservoir</span>
            {' — '}crvUSD · Arbitrum{' → '}
            <span style={{ color: T.amber, fontWeight: 600 }}>budúci Limit Buy BTC</span>
          </p>
        </div>

        {/* Trigger legend */}
        <div style={{ padding: '6px 12px', borderBottom: `1px solid ${T.border}`,
          display: 'flex', gap: 8, flexWrap: 'wrap' as const }}>
          {[
            { l: 'A: RSI>75 + F&G<55 → 5–10%', c: T.teal    },
            { l: 'B: F&G 55–70 → 5%',           c: T.amber   },
            { l: 'C: F&G 70–85 → 10%',          c: T.amber   },
            { l: 'D: F&G >85 → 15%',            c: T.red     },
          ].map(x => (
            <span key={x.l} style={{ fontSize: 8, color: x.c, fontWeight: 600 }}>{x.l}</span>
          ))}
        </div>

        {/* Loading state */}
        {radarLoading && (
          <div style={{ padding: '16px 12px', display: 'flex', alignItems: 'center', gap: 8 }}>
            <RefreshCw size={12} className="animate-spin" style={{ color: T.teal }} />
            <span style={{ fontSize: 10, color: T.textMuted }}>Načítavam live dáta z Binance + alternative.me…</span>
          </div>
        )}

        {/* Token cards */}
        <div style={{ padding: '10px 10px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {(['BTC', 'ETH', 'SOL'] as DcaT[]).map(sym => (
            <DcaTokenCard
              key={sym}
              sym={sym}
              price={radarPrices[sym].price}
              rsi={radarPrices[sym].rsi}
              fg={fg}
              dcaPrice={dcaPrices[sym] ?? 0}
              onDcaChange={v => updateDcaPrice(sym, v)}
            />
          ))}
        </div>

        {/* Footer */}
        <div style={{ padding: '6px 12px', borderTop: `1px solid ${T.border}`,
          display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <p style={{ fontSize: 8.5, color: T.textMuted }}>Dáta: Binance API (1d klines) · alternative.me (F&G)</p>
          <p style={{ fontSize: 8.5, color: T.textMuted }}>Klikni na token pre detail a DCA cenu</p>
        </div>
      </div>

      {/* ────────────── OCTAGON + NEWS ────────────── */}
      <ConfluenceOctagon activeToken={octagonToken} onTokenChange={setOctagonToken} />
      <MacroNewsTicker activeToken={octagonToken} />

      {/* ────────────── MODULE GRID ────────────── */}
      <div>
        <p style={{ fontSize: 9, fontWeight: 600, color: T.textMuted, textTransform: 'uppercase',
          letterSpacing: '0.1em', paddingLeft: 2, marginBottom: 8 }}>Moduly</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
          {MODULES.map(mod => {
            const Icon = mod.icon;
            return (
              <button key={mod.id} onClick={() => onNavigate(mod.id)}
                className="terminal-btn">
                <Icon size={15} />
                <span style={{ fontSize: 9, fontWeight: 600, lineHeight: 1 }}>{mod.label}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
