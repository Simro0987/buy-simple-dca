/**
 * DcaOutRadar — Algoritmický výber ziskov do Profit Reservoiru (crvUSD)
 * Design: Edge Trader Terminal dark style (inline styles, no Tailwind color classes)
 */
import { useState, useCallback } from 'react';
import { RefreshCw, ShieldCheck, AlertTriangle, TrendingUp, ArrowDownRight, Lock, RotateCcw, ChevronDown, ChevronUp, Target, Zap, ArrowRight } from 'lucide-react';
import {
  useDcaOutRadar,
  loadDcaPrices, saveDcaPrices, triggerCooldown, resetCooldown,
  type DcaToken, type DcaOutSignal,
} from '@/hooks/useDcaOutRadar';

// ─── design tokens (same as TerminalDashboard) ────────────────────────────────

const T = {
  card:      'rgba(17,24,39,0.90)',
  border:    'rgba(255,255,255,0.07)',
  teal:      '#0ea5e9',
  tealBg:    'rgba(14,165,233,0.11)',
  green:     '#10b981',
  greenBg:   'rgba(16,185,129,0.10)',
  red:       '#ef4444',
  redBg:     'rgba(239,68,68,0.10)',
  amber:     '#f59e0b',
  amberBg:   'rgba(245,158,11,0.10)',
  text:      '#f1f5f9',
  textSub:   'rgba(148,163,184,0.70)',
  textMuted: 'rgba(100,116,139,0.55)',
  radius:    '10px',
  radiusSm:  '7px',
};

const TOKEN_COLOR: Record<DcaToken, string> = {
  BTC: '#F7931A', ETH: '#627EEA', SOL: '#9945FF',
};

// ─── sub-components ───────────────────────────────────────────────────────────

function Pill({ label, color, bg }: { label: string; color: string; bg: string }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center',
      fontSize: 8.5, fontWeight: 700, letterSpacing: '0.05em',
      textTransform: 'uppercase' as const,
      padding: '2px 7px', borderRadius: 4, color, background: bg,
    }}>
      {label}
    </span>
  );
}

function StatusBadge({ status }: { status: DcaOutSignal['status'] }) {
  if (status === 'SELL') return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      fontSize: 9, fontWeight: 800, letterSpacing: '0.07em',
      padding: '3px 8px', borderRadius: 5,
      background: T.redBg, color: T.red,
      border: `1px solid ${T.red}40`,
    }}>
      <Zap size={9} /> PREDAJ
    </span>
  );
  if (status === 'HOLD') return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      fontSize: 9, fontWeight: 700, letterSpacing: '0.07em',
      padding: '3px 8px', borderRadius: 5,
      background: T.tealBg, color: T.teal,
      border: `1px solid ${T.teal}40`,
    }}>
      <ShieldCheck size={9} /> HOLD
    </span>
  );
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      fontSize: 9, fontWeight: 700, letterSpacing: '0.07em',
      padding: '3px 8px', borderRadius: 5,
      background: T.greenBg, color: T.green,
      border: `1px solid ${T.green}40`,
    }}>
      <TrendingUp size={9} /> AKUMULÁCIA
    </span>
  );
}

// Guard indicator row
function Guard({ passed, label }: { passed: boolean; label: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
      {passed
        ? <ShieldCheck size={10} style={{ color: T.green, flexShrink: 0 }} />
        : <AlertTriangle size={10} style={{ color: T.amber, flexShrink: 0 }} />}
      <span style={{ fontSize: 9.5, color: passed ? T.green : T.amber }}>{label}</span>
    </div>
  );
}

// DCA price input field
function DcaPriceInput({
  symbol, value, onChange,
}: { symbol: DcaToken; value: number; onChange: (v: number) => void }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <span style={{ fontSize: 9, color: T.textMuted, minWidth: 55 }}>DCA cena:</span>
      <span style={{ fontSize: 9, color: T.textMuted }}>$</span>
      <input
        type="number"
        step="0.01"
        min="0"
        value={value || ''}
        placeholder="0.00"
        onChange={e => onChange(parseFloat(e.target.value) || 0)}
        style={{
          flex: 1,
          background: 'rgba(255,255,255,0.04)',
          border: `1px solid ${T.border}`,
          borderRadius: 5,
          color: T.text,
          fontSize: 11,
          fontWeight: 600,
          padding: '3px 8px',
          fontVariantNumeric: 'tabular-nums',
          outline: 'none',
          width: '100%',
          maxWidth: 110,
        }}
      />
    </div>
  );
}

// Execution command block for SELL
function ExecutionBlock({ signal }: { signal: DcaOutSignal }) {
  const qty    = signal.sellQty.toPrecision(6).replace(/\.?0+$/, '');
  const pctStr = `${signal.sellPct}%`;

  return (
    <div style={{
      marginTop: 10,
      background: 'rgba(239,68,68,0.06)',
      border: `1px solid rgba(239,68,68,0.20)`,
      borderRadius: T.radiusSm,
      padding: '10px 12px',
    }}>
      {/* Trigger label */}
      <div style={{ fontSize: 9, fontWeight: 700, color: T.red, marginBottom: 8, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
        ⚡ {signal.triggerLabel}
      </div>

      {/* Action rows */}
      {[
        { icon: '🔴', label: 'AKCIA',     value: `Predaj presne ${qty} ${signal.symbol}  (${pctStr} pozície)` },
        { icon: '📂', label: 'ZDROJ',     value: signal.sources.join(' / ') },
        { icon: '🎯', label: 'CIEĽ',      value: 'Zameň za crvUSD → Profit Reservoir (Arbitrum)' },
        { icon: '⚡', label: 'STRATÉGIA', value: 'Zisk pripravený na budúci Limit Buy BTC' },
      ].map(row => (
        <div key={row.label} style={{
          display: 'flex', alignItems: 'flex-start', gap: 6,
          marginBottom: 5, fontSize: 10,
        }}>
          <span style={{ fontSize: 12, lineHeight: 1, marginTop: 1, flexShrink: 0 }}>{row.icon}</span>
          <span style={{ color: T.textMuted, fontWeight: 700, minWidth: 70, flexShrink: 0 }}>{row.label}:</span>
          <span style={{ color: T.text, lineHeight: 1.35 }}>{row.value}</span>
        </div>
      ))}

      {/* Confirm cooldown button */}
      <button
        onClick={() => triggerCooldown(signal.symbol, signal.currentPrice)}
        style={{
          marginTop: 8,
          display: 'flex', alignItems: 'center', gap: 5,
          background: 'rgba(239,68,68,0.12)',
          border: `1px solid rgba(239,68,68,0.30)`,
          borderRadius: 5, padding: '5px 10px',
          color: T.red, fontSize: 9, fontWeight: 700,
          cursor: 'pointer', letterSpacing: '0.05em',
        }}
      >
        <Lock size={9} /> Potvrď predaj → Aktivuj cooldown
      </button>
    </div>
  );
}

// Single token signal card
function TokenCard({
  signal, dcaPrice, onDcaChange,
}: { signal: DcaOutSignal; dcaPrice: number; onDcaChange: (v: number) => void }) {
  const [expanded, setExpanded] = useState(false);
  const tc = TOKEN_COLOR[signal.symbol];

  return (
    <div style={{
      background: T.card,
      border: `1px solid ${T.border}`,
      borderRadius: T.radius,
      borderLeft: `2px solid ${tc}`,
      overflow: 'hidden',
    }}>
      {/* Header row */}
      <button
        onClick={() => setExpanded(v => !v)}
        style={{
          width: '100%', background: 'transparent', border: 'none',
          cursor: 'pointer', padding: '10px 12px',
          display: 'flex', alignItems: 'center', gap: 8,
        }}
      >
        {/* Token badge */}
        <span style={{
          fontSize: 10, fontWeight: 800, color: tc,
          background: `${tc}18`, border: `1px solid ${tc}30`,
          borderRadius: 5, padding: '2px 7px', letterSpacing: '0.05em',
          flexShrink: 0,
        }}>
          {signal.symbol}
        </span>

        {/* Status badge */}
        <StatusBadge status={signal.status} />

        <div style={{ flex: 1 }} />

        {/* P&L summary */}
        {signal.dcaPrice > 0 && signal.currentPrice > 0 && (
          <span style={{
            fontSize: 10, fontWeight: 700, fontVariantNumeric: 'tabular-nums',
            color: signal.pnlPct >= 0 ? T.green : T.red,
          }}>
            {signal.pnlPct >= 0 ? '+' : ''}{signal.pnlPct.toFixed(1)}%
          </span>
        )}

        {expanded
          ? <ChevronUp   size={12} style={{ color: T.textMuted, flexShrink: 0 }} />
          : <ChevronDown size={12} style={{ color: T.textMuted, flexShrink: 0 }} />}
      </button>

      {/* Expanded detail */}
      {expanded && (
        <div style={{ padding: '0 12px 12px', borderTop: `1px solid ${T.border}` }}>
          {/* Price row */}
          <div style={{
            display: 'grid', gridTemplateColumns: '1fr 1fr',
            gap: 8, marginTop: 10, marginBottom: 10,
          }}>
            <div>
              <p style={{ fontSize: 9, color: T.textMuted, marginBottom: 3 }}>CENA BINANCE</p>
              <p style={{ fontSize: 14, fontWeight: 700, color: T.text, fontVariantNumeric: 'tabular-nums' }}>
                ${signal.currentPrice > 0 ? signal.currentPrice.toLocaleString('en-US', { maximumFractionDigits: 2 }) : '—'}
              </p>
            </div>
            <div>
              <p style={{ fontSize: 9, color: T.textMuted, marginBottom: 3 }}>HOLDINGS</p>
              <p style={{ fontSize: 14, fontWeight: 700, color: T.text, fontVariantNumeric: 'tabular-nums' }}>
                {signal.holdings > 0 ? signal.holdings.toPrecision(5) : '0.000'} {signal.symbol}
              </p>
            </div>
          </div>

          {/* DCA price input */}
          <div style={{ marginBottom: 10 }}>
            <DcaPriceInput symbol={signal.symbol} value={dcaPrice} onChange={onDcaChange} />
          </div>

          {/* Market indicators */}
          <div style={{
            display: 'flex', gap: 6, marginBottom: 10, flexWrap: 'wrap' as const,
          }}>
            <Pill label={`RSI(14d) ${signal.rsi}`}
              color={signal.rsi > 75 ? T.red : signal.rsi < 35 ? T.green : T.teal}
              bg={signal.rsi > 75 ? T.redBg : signal.rsi < 35 ? T.greenBg : T.tealBg}
            />
            <Pill label={`F&G ${signal.fearGreed}`}
              color={signal.fearGreed > 70 ? T.red : signal.fearGreed < 35 ? T.green : T.amber}
              bg={signal.fearGreed > 70 ? T.redBg : signal.fearGreed < 35 ? T.greenBg : T.amberBg}
            />
          </div>

          {/* Guards */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 8 }}>
            <Guard
              passed={signal.pnlGuardPassed}
              label={signal.dcaPrice > 0
                ? `PnL Guard: ${signal.pnlPct >= 0 ? '+' : ''}${signal.pnlPct.toFixed(1)}% ${signal.pnlGuardPassed ? '≥ +20% ✓' : '< +20% — HOLD'}`
                : 'PnL Guard: nastav DCA cenu pre výpočet'}
            />
            <Guard
              passed={!signal.cooldownActive}
              label={signal.cooldownActive
                ? `Cooldown aktívny — čakám na rast +5% od $${signal.cooldownPrice.toLocaleString('en-US', { maximumFractionDigits: 0 })}`
                : 'Cooldown: Voľný — žiadne čakanie'}
            />
            <Guard
              passed={signal.moonBagGuardPassed || signal.status !== 'SELL'}
              label={`Moon-Bag Guard: min. 15% (${(signal.holdings * 0.15).toPrecision(4)} ${signal.symbol}) zostane`}
            />
          </div>

          {/* HOLD message */}
          {signal.status !== 'SELL' && (
            <div style={{
              background: signal.status === 'ACCUMULATE' ? T.greenBg : T.tealBg,
              border: `1px solid ${signal.status === 'ACCUMULATE' ? T.green : T.teal}30`,
              borderRadius: T.radiusSm,
              padding: '8px 10px',
            }}>
              <p style={{ fontSize: 10, color: signal.status === 'ACCUMULATE' ? T.green : T.teal, fontWeight: 600 }}>
                {signal.status === 'ACCUMULATE'
                  ? `STATUS: ${signal.symbol} AKUMULÁCIA / HOLD — nespĺňa podmienku min. +20% zisku.`
                  : `STATUS: ${signal.symbol} HOLD — žiadny aktívny trigger. Všetky poistky OK.`}
              </p>
            </div>
          )}

          {/* SELL execution block */}
          {signal.status === 'SELL' && <ExecutionBlock signal={signal} />}

          {/* Reset cooldown */}
          {signal.cooldownActive && (
            <button
              onClick={() => resetCooldown(signal.symbol)}
              style={{
                marginTop: 8,
                display: 'flex', alignItems: 'center', gap: 5,
                background: 'transparent',
                border: `1px solid ${T.border}`,
                borderRadius: 5, padding: '4px 8px',
                color: T.textMuted, fontSize: 9, fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              <RotateCcw size={9} /> Resetuj cooldown manuálne
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ─── main component ───────────────────────────────────────────────────────────

export function DcaOutRadar() {
  const [dcaPrices, setDcaPricesState] = useState(loadDcaPrices);

  const updateDcaPrice = useCallback((symbol: DcaToken, value: number) => {
    setDcaPricesState(prev => {
      const next = { ...prev, [symbol]: value };
      saveDcaPrices(next);
      return next;
    });
  }, []);

  const { signals, fearGreed, isLoading, refetch } = useDcaOutRadar(dcaPrices);

  const sellCount = signals.filter(s => s.status === 'SELL').length;

  return (
    <div style={{
      background: T.card,
      border: `1px solid ${T.border}`,
      borderRadius: T.radius,
      overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '10px 12px',
        borderBottom: `1px solid ${T.border}`,
        background: 'rgba(14,165,233,0.04)',
      }}>
        <Target size={13} style={{ color: T.teal, flexShrink: 0 }} />
        <div style={{ flex: 1 }}>
          <p style={{ fontSize: 10, fontWeight: 800, color: T.text, textTransform: 'uppercase', letterSpacing: '0.07em', lineHeight: 1 }}>
            DCA-Out Radar
          </p>
          <p style={{ fontSize: 8.5, color: T.textMuted, marginTop: 2 }}>
            Výber ziskov → Profit Reservoir crvUSD · Arbitrum
          </p>
        </div>

        {/* Global F&G indicator */}
        <div style={{ textAlign: 'center' }}>
          <p style={{ fontSize: 8, color: T.textMuted, marginBottom: 2 }}>F&G</p>
          <span style={{
            fontSize: 10, fontWeight: 800,
            color: fearGreed > 70 ? T.red : fearGreed < 35 ? T.green : T.amber,
            fontVariantNumeric: 'tabular-nums',
          }}>{isLoading ? '…' : fearGreed}</span>
        </div>

        {/* Alert badge */}
        {sellCount > 0 && (
          <span style={{
            display: 'flex', alignItems: 'center', gap: 3,
            fontSize: 8.5, fontWeight: 800,
            background: T.redBg, color: T.red,
            border: `1px solid ${T.red}40`,
            borderRadius: 5, padding: '3px 7px',
          }}>
            <AlertTriangle size={9} />
            {sellCount} SIGNÁL{sellCount > 1 ? 'Y' : ''}
          </span>
        )}

        {/* Refresh */}
        <button
          onClick={refetch}
          disabled={isLoading}
          style={{
            background: 'transparent', border: 'none', cursor: 'pointer',
            color: T.textMuted, padding: 3, flexShrink: 0,
          }}
        >
          <RefreshCw size={11} style={{ animation: isLoading ? 'spin 1s linear infinite' : 'none' }} />
        </button>
      </div>

      {/* Cieľ info banner */}
      <div style={{
        padding: '8px 12px',
        borderBottom: `1px solid ${T.border}`,
        display: 'flex', alignItems: 'center', gap: 6,
      }}>
        <ArrowRight size={10} style={{ color: T.teal, flexShrink: 0 }} />
        <p style={{ fontSize: 9, color: T.textMuted, lineHeight: 1.4 }}>
          Cieľová stanica výberov: <span style={{ color: T.teal, fontWeight: 700 }}>Profit Reservoir</span>
          {' — '}crvUSD na sieti <span style={{ color: T.text, fontWeight: 600 }}>Arbitrum</span>
          {' → '}čaká na budúci <span style={{ color: T.amber, fontWeight: 600 }}>Limit Buy BTC</span>
        </p>
      </div>

      {/* Token cards */}
      <div style={{ padding: '10px 10px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        {isLoading && (
          <div style={{ textAlign: 'center', padding: '20px 0', color: T.textMuted, fontSize: 11 }}>
            <RefreshCw size={14} style={{ animation: 'spin 1s linear infinite', display: 'inline', marginRight: 6 }} />
            Načítavam live dáta (Binance + alternative.me)…
          </div>
        )}
        {!isLoading && signals.map(signal => (
          <TokenCard
            key={signal.symbol}
            signal={signal}
            dcaPrice={dcaPrices[signal.symbol] ?? 0}
            onDcaChange={v => updateDcaPrice(signal.symbol, v)}
          />
        ))}
      </div>

      {/* Footer */}
      <div style={{
        padding: '6px 12px', borderTop: `1px solid ${T.border}`,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <p style={{ fontSize: 8.5, color: T.textMuted }}>
          Dáta: Binance API (1d klines) · alternative.me (F&G)
        </p>
        <div style={{ display: 'flex', gap: 8 }}>
          {(['SELL', 'HOLD', 'ACCUMULATE'] as const).map(st => {
            const count = signals.filter(s => s.status === st).length;
            if (count === 0) return null;
            const col = st === 'SELL' ? T.red : st === 'HOLD' ? T.teal : T.green;
            return (
              <span key={st} style={{ fontSize: 8, color: col, fontWeight: 700 }}>
                {count}× {st}
              </span>
            );
          })}
        </div>
      </div>
    </div>
  );
}
