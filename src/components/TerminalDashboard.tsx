/**
 * TerminalDashboard — Main home page built from scratch
 * Visual reference: Edge Trader Terminal (terminal.io)
 *
 * Logic: reuses all existing hooks unchanged
 * UI: 100% new, inline styles only for colors (no Tailwind color overrides)
 */
import { useState } from 'react';
import {
  PieChart, Calculator, Shield, Activity, BarChart3,
  DollarSign, Coins, Settings, Wallet, TrendingUp,
  TrendingDown, Briefcase, BarChart2, RefreshCw,
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

interface Props {
  onNavigate: (tab: TabId) => void;
  lang: Lang;
}

// ─── design tokens (exact match to photos) ───────────────────────────────────

const T = {
  bg:          '#0D1117',
  card:        'rgba(17,24,39,0.90)',
  cardHover:   'rgba(22,32,52,0.95)',
  border:      'rgba(255,255,255,0.07)',
  borderHover: 'rgba(14,165,233,0.30)',
  teal:        '#0ea5e9',
  tealBg:      'rgba(14,165,233,0.11)',
  green:       '#10b981',
  greenBg:     'rgba(16,185,129,0.11)',
  red:         '#ef4444',
  redBg:       'rgba(239,68,68,0.11)',
  amber:       '#f59e0b',
  amberBg:     'rgba(245,158,11,0.11)',
  text:        '#f1f5f9',
  textSub:     'rgba(148,163,184,0.70)',
  textMuted:   'rgba(100,116,139,0.55)',
  radius:      '10px',
  radiusSm:    '7px',
};

// shared card wrapper style
const CARD = (extra?: React.CSSProperties): React.CSSProperties => ({
  background: T.card,
  border: `1px solid ${T.border}`,
  borderRadius: T.radius,
  padding: '12px',
  ...extra,
});

// small icon box
const ICON_BOX = (bg: string): React.CSSProperties => ({
  width: 28, height: 28,
  borderRadius: 8,
  background: bg,
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  marginBottom: 8,
  flexShrink: 0,
});

// status pill tag
function Tag({ label, color, bg }: { label: string; color: string; bg: string }) {
  return (
    <span style={{
      fontSize: 8.5, fontWeight: 700, letterSpacing: '0.05em',
      textTransform: 'uppercase' as const, padding: '2px 6px',
      borderRadius: 4, color, background: bg,
    }}>
      {label}
    </span>
  );
}

// ─── module list ──────────────────────────────────────────────────────────────

const MODULES: { id: TabId; label: string; icon: typeof PieChart }[] = [
  { id: 'portfolio', label: 'Portfólio',  icon: PieChart   },
  { id: 'dca',       label: 'DCA',        icon: Calculator },
  { id: 'risk',      label: 'Riziko',     icon: Shield     },
  { id: 'analysis',  label: 'Analýza',    icon: Activity   },
  { id: 'market',    label: 'Trh',        icon: BarChart3  },
  { id: 'profit',    label: 'Zisky',      icon: DollarSign },
  { id: 'staking',   label: 'Staking',    icon: Coins      },
  { id: 'wallets',   label: 'Wallety',    icon: Wallet     },
  { id: 'settings',  label: 'Nastav.',    icon: Settings   },
];

// ─── helpers ──────────────────────────────────────────────────────────────────

function loadInvested(): number {
  try { return parseFloat(localStorage.getItem('total-invested') || '0') || 0; }
  catch { return 0; }
}

// ─── component ────────────────────────────────────────────────────────────────

export function TerminalDashboard({ onNavigate, lang }: Props) {
  const { data: prices, isFetching, refetch } = usePrices();
  const metrics = usePortfolioMetrics(prices);
  const [octagonToken, setOctagonToken] = useState<OctToken>('BTC');

  const invested   = loadInvested();
  const totalValue = metrics.totalValue;
  const pnlUsd     = totalValue - invested;
  const pnlPct     = invested > 0 ? (pnlUsd / invested) * 100 : 0;
  const pnlPos     = pnlUsd >= 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>

      {/* ── Liquidation alert ───────────────────────────────────────────── */}
      <LiquidationAlertBanner lang={lang} />

      {/* ── Portfolio section ────────────────────────────────────────────── */}
      <div>
        {/* Section label */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, paddingLeft: 2 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Briefcase size={12} style={{ color: T.textMuted }} />
            <span style={{ fontSize: 10, fontWeight: 600, color: T.textMuted, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              Moje portfólio
            </span>
          </div>
          <button
            onClick={() => void refetch()}
            style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 4 }}
          >
            <RefreshCw size={11} style={{ color: T.textMuted, animation: isFetching ? 'spin 1s linear infinite' : 'none' }} />
          </button>
        </div>

        {/* 2-column stat cards */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>

          {/* Celková hodnota */}
          <div style={CARD()}>
            <div style={ICON_BOX(T.tealBg)}>
              <BarChart2 size={14} style={{ color: T.teal }} />
            </div>
            <p style={{ fontSize: 9.5, color: T.textSub, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>
              Celková hodnota
            </p>
            <p style={{ fontSize: 19, fontWeight: 700, color: T.text, lineHeight: 1.1, fontVariantNumeric: 'tabular-nums' }}>
              {totalValue > 0 ? formatUsd(totalValue) : '$0.00'}
            </p>
            <p style={{ fontSize: 10, color: T.textMuted, marginTop: 3 }}>{metrics.assets.length} pozícií</p>
          </div>

          {/* Reálny vklad */}
          <div style={CARD()}>
            <div style={ICON_BOX(T.tealBg)}>
              <Wallet size={14} style={{ color: T.teal }} />
            </div>
            <p style={{ fontSize: 9.5, color: T.textSub, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>
              Reálny vklad
            </p>
            <p style={{ fontSize: 19, fontWeight: 700, color: T.text, lineHeight: 1.1, fontVariantNumeric: 'tabular-nums' }}>
              {invested > 0 ? formatUsd(invested) : '$0.00'}
            </p>
            <p style={{ fontSize: 10, color: T.textMuted, marginTop: 3 }}>investovaný kapitál</p>
          </div>

          {/* Celkový zisk/strata */}
          <div style={CARD()}>
            <div style={ICON_BOX(pnlPos ? T.greenBg : T.redBg)}>
              {pnlPos
                ? <TrendingUp   size={14} style={{ color: T.green }} />
                : <TrendingDown size={14} style={{ color: T.red   }} />}
            </div>
            <p style={{ fontSize: 9.5, color: T.textSub, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>
              Zisk / strata
            </p>
            <p style={{ fontSize: 19, fontWeight: 700, lineHeight: 1.1, fontVariantNumeric: 'tabular-nums', color: pnlPos ? T.green : T.red }}>
              {pnlPos ? '+' : ''}{formatUsd(pnlUsd)}
            </p>
            <div style={{ marginTop: 3 }}>
              <Tag
                label={`${pnlPos ? '+' : ''}${pnlPct.toFixed(2)}%`}
                color={pnlPos ? T.green : T.red}
                bg={pnlPos ? T.greenBg : T.redBg}
              />
            </div>
          </div>

          {/* Zmena dnes */}
          <div style={CARD()}>
            <div style={ICON_BOX(T.tealBg)}>
              <BarChart3 size={14} style={{ color: T.teal }} />
            </div>
            <p style={{ fontSize: 9.5, color: T.textSub, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>
              Zmena dnes
            </p>
            {/* Sum of 24h changes weighted by portfolio */}
            {(() => {
              const dayChange = metrics.assets.reduce((sum, a) => {
                const ch = prices?.[TOKENS.find(t => t.symbol === a.symbol)?.coingeckoId ?? '']?.usd_24h_change ?? 0;
                return sum + (a.value * ch / 100);
              }, 0);
              const pos = dayChange >= 0;
              return (
                <>
                  <p style={{ fontSize: 19, fontWeight: 700, lineHeight: 1.1, fontVariantNumeric: 'tabular-nums', color: pos ? T.green : T.red }}>
                    {pos ? '+' : ''}{formatUsd(dayChange)}
                  </p>
                  <div style={{ marginTop: 3 }}>
                    <Tag label={pos ? 'RAST' : 'POKLES'} color={pos ? T.green : T.red} bg={pos ? T.greenBg : T.redBg} />
                  </div>
                </>
              );
            })()}
          </div>
        </div>
      </div>

      {/* ── Token price strip ────────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
        {TOKENS.map(t => {
          const a    = metrics.assets.find(x => x.symbol === t.symbol);
          const ch24 = prices?.[t.coingeckoId]?.usd_24h_change ?? 0;
          const pos  = ch24 >= 0;
          return (
            <div key={t.symbol} style={{ ...CARD(), padding: '10px', borderLeft: `2px solid ${t.color}` }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: T.text }}>{t.symbol}</span>
                <Tag
                  label={`${pos ? '▲' : '▼'} ${Math.abs(ch24).toFixed(1)}%`}
                  color={pos ? T.green : T.red}
                  bg={pos ? T.greenBg : T.redBg}
                />
              </div>
              <p style={{ fontSize: 12, fontWeight: 700, color: T.text, fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>
                {a ? formatPrice(a.currentPrice) : '—'}
              </p>
              <p style={{ fontSize: 9, color: T.textMuted, marginTop: 4 }}>
                {Math.round(t.allocation * 100)}% alok.
              </p>
            </div>
          );
        })}
      </div>

      {/* ── Confluence Octagon + News ─────────────────────────────────────── */}
      <ConfluenceOctagon activeToken={octagonToken} onTokenChange={setOctagonToken} />
      <MacroNewsTicker activeToken={octagonToken} />

      {/* ── Module navigation ────────────────────────────────────────────── */}
      <div>
        <p style={{ fontSize: 9, fontWeight: 600, color: T.textMuted, textTransform: 'uppercase', letterSpacing: '0.1em', paddingLeft: 2, marginBottom: 8 }}>
          Moduly
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
          {MODULES.map(mod => {
            const Icon = mod.icon;
            return (
              <button
                key={mod.id}
                onClick={() => onNavigate(mod.id)}
                style={{
                  background: T.card,
                  border: `1px solid ${T.border}`,
                  borderRadius: T.radiusSm,
                  padding: '10px 6px',
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5,
                  color: T.textSub,
                  cursor: 'pointer',
                  width: '100%',
                  transition: 'all 0.15s ease',
                }}
                onMouseEnter={e => {
                  const b = e.currentTarget;
                  b.style.borderColor = T.borderHover;
                  b.style.color = T.text;
                  b.style.background = T.cardHover;
                }}
                onMouseLeave={e => {
                  const b = e.currentTarget;
                  b.style.borderColor = T.border;
                  b.style.color = T.textSub;
                  b.style.background = T.card;
                }}
              >
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
