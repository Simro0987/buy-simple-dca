/**
 * TerminalDashboard — Domovská stránka (Deep Space Bento Grid)
 */
import { useState, useEffect } from 'react';
import { Briefcase, RefreshCw } from 'lucide-react';
import { NAV_ITEMS, type TabId } from '@/lib/navItems';
import { ConfluenceOctagon } from '@/components/ConfluenceOctagon';
import { MacroNewsTicker } from '@/components/MacroNewsTicker';
import { LiquidationAlertBanner } from '@/components/LiquidationAlertBanner';
import { usePrices } from '@/hooks/usePrices';
import { usePortfolioMetrics } from '@/hooks/usePortfolioMetrics';
import { formatUsd, formatPrice, TOKENS } from '@/lib/crypto';
import { Lang } from '@/lib/i18n';
import type { OctToken } from '@/hooks/useConfluenceMetrics';
import { Bento, Label, Money, Chip } from '@/components/deep-space/primitives';

interface Props { onNavigate: (tab: TabId) => void; lang: Lang }

const MODULES = NAV_ITEMS.filter((n) => n.id !== 'home');

function loadInvested(): number {
  try { return parseFloat(localStorage.getItem('total-invested') || '0') || 0; } catch { return 0; }
}
function loadFreeCash(): number {
  try { return parseFloat(localStorage.getItem('free-cash') || '0') || 0; } catch { return 0; }
}

export function TerminalDashboard({ onNavigate, lang }: Props) {
  const { data: prices, isFetching, refetch } = usePrices();
  const metrics = usePortfolioMetrics(prices);
  const [octagonToken, setOctagonToken] = useState<OctToken>('BTC');

  const invested = loadInvested();
  const [freeCash, setFreeCash] = useState(loadFreeCash);
  const totalValue = metrics.totalValue;
  const pnlUsd = totalValue - invested;
  const pnlPct = invested > 0 ? (pnlUsd / invested) * 100 : 0;
  const pnlPos = pnlUsd >= 0;
  const heldAssets = metrics.assets.filter((a) => a.value > 0);
  const empty = totalValue <= 0;

  useEffect(() => {
    try { localStorage.setItem('free-cash', String(freeCash)); } catch { /* quota */ }
  }, [freeCash]);

  const dayChange = metrics.assets.reduce((s, a) => {
    const ch = prices?.[TOKENS.find(t => t.symbol === a.symbol)?.coingeckoId ?? '']?.usd_24h_change ?? 0;
    return s + a.value * ch / 100;
  }, 0);

  return (
    <div className="space-y-4">
      <LiquidationAlertBanner lang={lang} />

      {/* Portfolio hero */}
      <Bento delay={0.04} className="p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Briefcase className="w-4 h-4 text-white/35" />
            <Label>Moje portfólio · USD</Label>
          </div>
          <button onClick={() => void refetch()} className="p-1.5 rounded-lg hover:bg-white/[0.06]">
            <RefreshCw className={`w-3.5 h-3.5 text-white/40 ${isFetching ? 'animate-spin' : ''}`} />
          </button>
        </div>
        <Money size="hero">{totalValue > 0 ? formatUsd(totalValue) : '$0.00'}</Money>
        {empty ? (
          <div className="mt-3 space-y-2">
            <p className="text-xs text-white/50">
              Zatiaľ žiadne pozície. Pridaj svoje nákupy v Portfóliu alebo pripoj adresy peňaženiek – hodnoty sa potom prepočítajú živými cenami.
            </p>
            <div className="flex flex-wrap gap-2">
              <button onClick={() => onNavigate('portfolio')} className="px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-semibold">
                Pridať nákup
              </button>
              <button onClick={() => onNavigate('wallets')} className="px-3 py-1.5 rounded-lg border border-white/15 text-xs text-white/80">
                Pripojiť peňaženku
              </button>
              <button onClick={() => onNavigate('dca')} className="px-3 py-1.5 rounded-lg border border-white/15 text-xs text-white/80">
                Plán na tento týždeň
              </button>
            </div>
          </div>
        ) : (
          <p className="text-xs text-white/35 font-mono mt-2">{heldAssets.length} {heldAssets.length === 1 ? 'pozícia' : heldAssets.length < 5 ? 'pozície' : 'pozícií'}</p>
        )}
      </Bento>

      {/* Stats bento */}
      {!empty && <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Bento delay={0.08} className="p-4">
          <Label>Reálny vklad</Label>
          <Money size="md" className="mt-2 block">{invested > 0 ? formatUsd(invested) : '$0.00'}</Money>
        </Bento>
        <Bento delay={0.1} className="p-4">
          <Label>Zisk / strata</Label>
          <Money size="md" positive={pnlPos} negative={!pnlPos} className="mt-2 block">
            {pnlPos ? '+' : ''}{formatUsd(pnlUsd)}
          </Money>
          <Chip color={pnlPos ? 'green' : 'red'}>
            {pnlPos ? '+' : ''}{pnlPct.toFixed(2)}%
          </Chip>
        </Bento>
        <Bento delay={0.12} className="p-4">
          <Label>Zmena dnes</Label>
          <Money size="md" positive={dayChange >= 0} negative={dayChange < 0} className="mt-2 block">
            {dayChange >= 0 ? '+' : ''}{formatUsd(dayChange)}
          </Money>
        </Bento>
        <Bento delay={0.14} className="p-4">
          <Label>Voľný cash</Label>
          <Money size="md" className="mt-2 block">{freeCash > 0 ? formatUsd(freeCash) : '$0.00'}</Money>
          <input
            type="number"
            min="0"
            step="10"
            value={freeCash || ''}
            placeholder="0"
            onChange={e => setFreeCash(parseFloat(e.target.value) || 0)}
            className="mt-2 w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2 font-mono text-sm text-white outline-none focus:border-white/25"
          />
        </Bento>
      </div>}

      {/* Token strip */}
      <div className="grid grid-cols-3 gap-3">
        {TOKENS.map((t, i) => {
          const a = metrics.assets.find(x => x.symbol === t.symbol);
          const ch = prices?.[t.coingeckoId]?.usd_24h_change ?? 0;
          const pos = ch >= 0;
          return (
            <Bento key={t.symbol} delay={0.16 + i * 0.03} className="p-3" style={{ borderLeftWidth: 2, borderLeftColor: t.color }}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-white">{t.symbol}</span>
                <Chip color={pos ? 'green' : 'red'}>{pos ? '▲' : '▼'}{Math.abs(ch).toFixed(1)}%</Chip>
              </div>
              <p className="font-mono text-sm font-bold text-white">
                {a?.currentPrice ? formatPrice(a.currentPrice) : prices?.[t.coingeckoId]?.usd ? formatPrice(prices[t.coingeckoId].usd) : '—'}
              </p>
              <p className="text-[9px] text-white/30 mt-1">cieľ {Math.round(t.allocation * 100)} %</p>
            </Bento>
          );
        })}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <ConfluenceOctagon activeToken={octagonToken} onTokenChange={setOctagonToken} />
        <MacroNewsTicker activeToken={octagonToken} />
      </div>

      {/* Module grid */}
      <div>
        <Label className="mb-3 block">Moduly</Label>
        <div className="grid grid-cols-3 sm:grid-cols-5 gap-3">
          {MODULES.map(mod => {
            const Icon = mod.icon;
            return (
              <button key={mod.id} onClick={() => onNavigate(mod.id)} className="terminal-btn">
                <Icon size={16} className="text-[#14F195]/80" />
                <span className="text-[10px] font-semibold">{lang === 'sk' ? mod.sk : mod.en}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
