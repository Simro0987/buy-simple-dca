/**
 * AutoLimitTrackerCard
 *
 * Per-token dynamic limit orders with:
 *  • ATR-based discount calculated live from Binance
 *  • One-click 7-day price lock — frozen until filled, expired, or cancelled
 *  • Auto-execution badge when price is touched
 *  • Countdown timer while active
 */
import { useState, useEffect } from 'react';
import { Lock, Unlock, RefreshCw, CheckCircle2, Clock, XCircle, Zap, TrendingDown } from 'lucide-react';
import { usePrices } from '@/hooks/usePrices';
import { useAutoLimitTracker, type LimitSymbol, type LockedOrder } from '@/hooks/useAutoLimitTracker';
import { formatUsd } from '@/lib/crypto';

// ─── design tokens (consistent with TerminalDashboard / LiveDcaOutRadar) ──────
const T = {
  card:    '#0A0A0A',
  border:  'rgba(255,255,255,0.10)',
  green:   '#14F195', greenBg: 'rgba(20,241,149,0.11)',
  red:     '#ef4444', redBg:   'rgba(239,68,68,0.11)',
  amber:   '#f59e0b', amberBg: 'rgba(245,158,11,0.11)',
  teal:    '#0ea5e9', tealBg:  'rgba(14,165,233,0.11)',
  text:    '#ffffff',
  textSub: 'rgba(255,255,255,0.65)',
  textMut: 'rgba(255,255,255,0.35)',
  r:       '1.5rem',
  rs:      '0.875rem',
};

const TOKEN_COLOR: Record<LimitSymbol, string> = {
  BTC: '#F7931A', ETH: '#627EEA', SOL: '#9945FF',
};

const CG_ID: Record<LimitSymbol, string> = {
  BTC: 'bitcoin', ETH: 'ethereum', SOL: 'solana',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function msToCountdown(ms: number): string {
  if (ms <= 0) return '00:00:00';
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d > 0) return `${d}d ${h}h ${m}m`;
  return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s % 60).padStart(2,'0')}`;
}

function Pill({ l, c, bg }: { l: string; c: string; bg: string }) {
  return (
    <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.05em',
      textTransform: 'uppercase' as const, padding: '2px 7px', borderRadius: 4,
      color: c, background: bg }}>
      {l}
    </span>
  );
}

// ─── Single token order card ──────────────────────────────────────────────────

function TokenOrderCard({ sym, livePrice }: { sym: LimitSymbol; livePrice: number }) {
  const { orders, indicators, indicatorsLoading, lockOrder, cancelOrder, resetOrder, getDiscount } = useAutoLimitTracker();
  const [volumeUsd, setVolumeUsd] = useState<number>(100);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const order = orders[sym];
  const tc    = TOKEN_COLOR[sym];
  const discountPct  = getDiscount(sym, livePrice);
  const targetPrice  = livePrice > 0 ? livePrice * (1 - discountPct / 100) : 0;
  const est50EMA     = indicators?.[sym]?.ema50;

  const isActive   = order?.status === 'active';
  const isFilled   = order?.status === 'filled';
  const isExpired  = order?.status === 'expired';
  const isTerminal = isFilled || isExpired || order?.status === 'cancelled';

  // Countdown for active orders
  const timeLeft  = order ? Math.max(0, order.expiresAt - now) : 0;

  return (
    <div style={{
      background: T.card,
      border: `1px solid ${isActive ? tc + '55' : isFilled ? T.green + '55' : T.border}`,
      borderRadius: T.rs,
      borderLeft: `2px solid ${tc}`,
      overflow: 'hidden',
      boxShadow: isActive ? `0 0 20px ${tc}18` : isFilled ? `0 0 20px ${T.green}22` : 'none',
      transition: 'box-shadow 0.4s, border-color 0.4s',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px',
        borderBottom: `1px solid rgba(255,255,255,0.06)` }}>
        <span style={{ fontSize: 10, fontWeight: 800, color: tc, background: tc + '18',
          border: `1px solid ${tc}30`, borderRadius: 6, padding: '2px 8px', letterSpacing: '0.05em' }}>
          {sym}
        </span>

        {/* Status badge */}
        {!order && (
          <Pill l="Live · Odomknuté" c={T.teal} bg={T.tealBg} />
        )}
        {isActive && (
          <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 9, fontWeight: 800,
            color: T.green, background: T.greenBg, border: `1px solid ${T.green}40`,
            borderRadius: 5, padding: '3px 8px', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
            <Zap size={9} className="animate-pulse" /> AKTÍVNA – ČAKÁ NA KNÔT
          </span>
        )}
        {isFilled && (
          <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 9, fontWeight: 800,
            color: '#14F195', background: T.greenBg, border: `1px solid ${T.green}40`,
            borderRadius: 5, padding: '3px 8px', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
            <CheckCircle2 size={9} /> ZREALIZOVANÁ
          </span>
        )}
        {isExpired && (
          <Pill l="VYPRŠANÁ" c={T.amber} bg={T.amberBg} />
        )}

        <span style={{ flex: 1 }} />

        {/* Live price */}
        {livePrice > 0 && (
          <span style={{ fontSize: 11, fontWeight: 700, color: T.text, fontVariantNumeric: 'tabular-nums' }}>
            {formatUsd(livePrice)}
          </span>
        )}
        {indicatorsLoading && <RefreshCw size={11} className="animate-spin" style={{ color: T.textMut }} />}
      </div>

      {/* Body */}
      <div style={{ padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 8 }}>

        {/* ACTIVE order details */}
        {isActive && order && (
          <>
            {/* Frozen price info */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              {[
                { l: 'Zmrazená zľava', v: `–${order.discountPct.toFixed(1)}%` },
                { l: 'Cieľová cena (lock)', v: formatUsd(order.targetPrice) },
                { l: 'Objem (USD)', v: formatUsd(order.volumeUsd) },
                { l: 'Odhadovaný objem', v: `${order.volumeToken.toFixed(4)} ${sym}` },
              ].map(item => (
                <div key={item.l} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)',
                  borderRadius: 8, padding: '8px 10px' }}>
                  <p style={{ fontSize: 8.5, color: T.textMut, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 3 }}>{item.l}</p>
                  <p style={{ fontSize: 13, fontWeight: 700, color: T.text, fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>{item.v}</p>
                </div>
              ))}
            </div>

            {/* Countdown */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6,
              background: 'rgba(245,158,11,0.07)', border: '1px solid rgba(245,158,11,0.20)',
              borderRadius: 8, padding: '7px 10px' }}>
              <Clock size={11} style={{ color: T.amber, flexShrink: 0 }} />
              <span style={{ fontSize: 9.5, color: T.amber, fontVariantNumeric: 'tabular-nums' }}>
                Čas do vypršania: <strong>{msToCountdown(timeLeft)}</strong>
              </span>
            </div>

            {/* Cancel button */}
            <button
              onClick={() => cancelOrder(sym)}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                background: T.redBg, border: `1px solid ${T.red}40`,
                borderRadius: 8, padding: '9px 14px',
                color: T.red, fontSize: 11, fontWeight: 700, cursor: 'pointer',
                letterSpacing: '0.03em' }}
            >
              <XCircle size={13} /> Zrušiť / Reset objednávku
            </button>
          </>
        )}

        {/* FILLED order details */}
        {isFilled && order && (
          <>
            <div style={{ background: T.greenBg, border: `1px solid ${T.green}30`, borderRadius: 8, padding: '10px 12px' }}>
              <p style={{ fontSize: 10, fontWeight: 800, color: T.green, marginBottom: 4 }}>
                ✅ Limitná objednávka zrealizovaná!
              </p>
              <p style={{ fontSize: 11, color: T.text, fontVariantNumeric: 'tabular-nums' }}>
                Kúpené: <strong>{order.volumeToken.toFixed(4)} {sym}</strong> za {formatUsd(order.filledPrice ?? order.targetPrice)}
              </p>
              <p style={{ fontSize: 9.5, color: T.textSub, marginTop: 4 }}>
                ✓ Automaticky zapísané do portfólia
              </p>
            </div>
            <button onClick={() => resetOrder(sym)}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                background: T.tealBg, border: `1px solid ${T.teal}40`, borderRadius: 8, padding: '9px 14px',
                color: T.teal, fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
              <RefreshCw size={12} /> Nový 7-dňový cyklus
            </button>
          </>
        )}

        {/* EXPIRED order */}
        {isExpired && order && (
          <>
            <div style={{ background: T.amberBg, border: `1px solid ${T.amber}30`, borderRadius: 8, padding: '9px 12px' }}>
              <p style={{ fontSize: 10, color: T.amber, fontWeight: 700 }}>
                ⏰ Objednávka vypršala bez realizácie. Cena {sym} sa počas 7 dní nedostala na {formatUsd(order.targetPrice)}.
              </p>
            </div>
            <button onClick={() => resetOrder(sym)}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                background: 'rgba(255,255,255,0.05)', border: `1px solid ${T.border}`, borderRadius: 8, padding: '9px 14px',
                color: T.textSub, fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
              <RefreshCw size={12} /> Resetovať a recalculate
            </button>
          </>
        )}

        {/* NEW ORDER form (no active/filled/expired order) */}
        {!order && (
          <>
            {/* Indicators */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              {[
                { l: 'ATR(7d) zľava', v: discountPct > 0 ? `–${discountPct.toFixed(1)}%` : '…', c: T.amber },
                { l: 'Cieľová cena', v: targetPrice > 0 ? formatUsd(targetPrice) : '…', c: T.teal },
                ...(est50EMA ? [{ l: '50D EMA', v: formatUsd(est50EMA), c: T.textSub }] : []),
              ].map(item => (
                <div key={item.l} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)',
                  borderRadius: 8, padding: '8px 10px' }}>
                  <p style={{ fontSize: 8.5, color: T.textMut, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 3 }}>{item.l}</p>
                  <p style={{ fontSize: 13, fontWeight: 700, color: item.c, fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>{item.v}</p>
                </div>
              ))}
            </div>

            {/* Volume input */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 9, color: T.textMut, flexShrink: 0 }}>Objem ($)</span>
              <input
                type="number" min="10" step="10" value={volumeUsd || ''}
                placeholder="100"
                onChange={e => setVolumeUsd(parseFloat(e.target.value) || 100)}
                style={{ flex: 1, background: 'rgba(255,255,255,0.05)', border: `1px solid ${T.border}`,
                  borderRadius: 8, color: T.text, fontSize: 12, fontWeight: 600,
                  padding: '6px 10px', outline: 'none', fontVariantNumeric: 'tabular-nums', maxWidth: 120 }}
              />
              {targetPrice > 0 && volumeUsd > 0 && (
                <span style={{ fontSize: 9.5, color: T.textMut, flexShrink: 0 }}>
                  ≈ {(volumeUsd / targetPrice).toFixed(4)} {sym}
                </span>
              )}
            </div>

            {/* Lock button */}
            <button
              disabled={targetPrice <= 0 || volumeUsd <= 0}
              onClick={() => lockOrder(sym, discountPct, targetPrice, volumeUsd)}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                background: targetPrice > 0 ? tc + 'CC' : 'rgba(255,255,255,0.08)',
                border: `1px solid ${tc}60`,
                borderRadius: 8, padding: '10px 14px',
                color: targetPrice > 0 ? '#000' : T.textMut,
                fontSize: 11, fontWeight: 800, cursor: targetPrice > 0 ? 'pointer' : 'not-allowed',
                letterSpacing: '0.04em', textTransform: 'uppercase' as const,
                opacity: targetPrice > 0 ? 1 : 0.5,
              }}
            >
              <Lock size={12} /> Aktivovať Limit Dynamic · Zámok 7D
            </button>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Main card ────────────────────────────────────────────────────────────────

export function AutoLimitTrackerCard() {
  const { data: prices, isFetching } = usePrices();

  const livePrices: Record<LimitSymbol, number> = {
    BTC: prices?.[CG_ID.BTC]?.usd ?? 0,
    ETH: prices?.[CG_ID.ETH]?.usd ?? 0,
    SOL: prices?.[CG_ID.SOL]?.usd ?? 0,
  };

  return (
    <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: T.r, overflow: 'hidden',
      boxShadow: '0 0 40px -10px rgba(20,241,149,0.15)' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 14px',
        borderBottom: `1px solid rgba(255,255,255,0.07)`,
        background: 'rgba(20,241,149,0.04)' }}>
        <TrendingDown size={14} style={{ color: T.green, flexShrink: 0 }} />
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <p style={{ fontSize: 11, fontWeight: 800, color: T.text, textTransform: 'uppercase',
              letterSpacing: '0.07em', lineHeight: 1 }}>
              Dynamic Limit · Auto-Tracker
            </p>
            <span style={{ fontSize: 8, fontWeight: 700, color: T.green, background: T.greenBg,
              border: `1px solid ${T.green}40`, borderRadius: 4, padding: '1px 5px', letterSpacing: '0.06em' }}>
              {isFetching ? 'SYNC…' : 'LIVE'}
            </span>
          </div>
          <p style={{ fontSize: 8.5, color: T.textMut, marginTop: 2 }}>
            ATR(7d) volatilita · 7-dňový zámok · Automatická exekúcia + zápis do portfólia
          </p>
        </div>
      </div>

      {/* Volatility legend */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 0,
        borderBottom: `1px solid rgba(255,255,255,0.06)` }}>
        {([
          { sym: 'BTC' as LimitSymbol, label: 'Konzervat. ×1.0',  range: '2–4%'   },
          { sym: 'ETH' as LimitSymbol, label: 'Stredná  ×1.6',    range: '3–6.5%' },
          { sym: 'SOL' as LimitSymbol, label: 'Vysoká   ×2.15',   range: '4.5–9%' },
        ] as { sym: LimitSymbol; label: string; range: string }[]).map(item => (
          <div key={item.sym} style={{ textAlign: 'center' as const, padding: '7px 4px',
            borderRight: item.sym !== 'SOL' ? '1px solid rgba(255,255,255,0.06)' : 'none' }}>
            <p style={{ fontSize: 8, color: TOKEN_COLOR[item.sym], fontWeight: 700 }}>{item.sym}</p>
            <p style={{ fontSize: 7.5, color: T.textMut }}>{item.label}</p>
            <p style={{ fontSize: 8, color: T.text, fontWeight: 700 }}>{item.range}</p>
          </div>
        ))}
      </div>

      {/* Token order cards */}
      <div style={{ padding: '10px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        {(['BTC', 'ETH', 'SOL'] as LimitSymbol[]).map(sym => (
          <TokenOrderCard key={sym} sym={sym} livePrice={livePrices[sym]} />
        ))}
      </div>

      {/* Footer */}
      <div style={{ padding: '6px 14px', borderTop: `1px solid rgba(255,255,255,0.06)` }}>
        <p style={{ fontSize: 8.5, color: T.textMut }}>
          Zdroj: Binance daily klines (ATR) · cache 4h · Ceny: CoinGecko (30s) · Auto-fill = zápis do portfólia
        </p>
      </div>
    </div>
  );
}
