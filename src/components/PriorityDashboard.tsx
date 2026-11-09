import { TrendingUp, TrendingDown, AlertTriangle, Trophy, Activity } from 'lucide-react';
import { usePrices, useAthData } from '@/hooks/usePrices';
import { TOKENS, formatUsd } from '@/lib/crypto';

interface PriorityItem {
  icon: typeof TrendingUp;
  label: string;
  tone: 'positive' | 'negative' | 'warning' | 'info';
}

function loadHoldings(): Record<string, number> {
  try { return JSON.parse(localStorage.getItem('smart-alloc-holdings') || '{}'); }
  catch { return {}; }
}

function toneClasses(tone: PriorityItem['tone']) {
  switch (tone) {
    case 'positive': return 'text-emerald-500 bg-emerald-500/10 border-emerald-500/20';
    case 'negative': return 'text-destructive bg-destructive/10 border-destructive/20';
    case 'warning': return 'text-amber-500 bg-amber-500/10 border-amber-500/20';
    case 'info': return 'text-primary bg-primary/10 border-primary/20';
  }
}

export function PriorityDashboard() {
  const { data: prices } = usePrices();
  const { data: athData } = useAthData();

  const items: PriorityItem[] = [];

  if (prices) {
    // Top mover (24h) among BTC/ETH/SOL
    const moves = TOKENS
      .map(t => {
        const p = prices[t.coingeckoId];
        return p ? { sym: t.symbol, change: p.usd_24h_change ?? 0, price: p.usd } : null;
      })
      .filter((x): x is { sym: string; change: number; price: number } => x !== null)
      .sort((a, b) => Math.abs(b.change) - Math.abs(a.change));

    if (moves[0]) {
      const m = moves[0];
      items.push({
        icon: m.change >= 0 ? TrendingUp : TrendingDown,
        label: `${m.sym} ${m.change >= 0 ? '+' : ''}${m.change.toFixed(2)}% za 24h`,
        tone: m.change >= 0 ? 'positive' : 'negative',
      });
    }

    // Holdings value & ATH check
    const holdings = loadHoldings();
    const totalValue = TOKENS.reduce((s, t) => s + (holdings[t.id] ?? 0) * (prices[t.coingeckoId]?.usd ?? 0), 0);

    if (totalValue > 0) {
      // Check portfolio history for ATH
      try {
        const raw = localStorage.getItem('portfolio-history-v2');
        if (raw) {
          const history = JSON.parse(raw) as { value: number }[];
          const max = Math.max(...history.map(h => h.value), 0);
          if (totalValue >= max * 0.99 && history.length > 5) {
            items.push({ icon: Trophy, label: 'Portfólio ATH dnes 🎉', tone: 'positive' });
          }
        }
      } catch { /* ignore */ }
    }

    // ATH distance warning for BTC
    if (athData) {
      const btcAth = athData['bitcoin'];
      const btcPrice = prices['bitcoin']?.usd;
      if (btcAth && btcPrice) {
        const dropPct = ((btcAth.ath - btcPrice) / btcAth.ath) * 100;
        if (dropPct > 30) {
          items.push({ icon: AlertTriangle, label: `BTC -${dropPct.toFixed(0)}% od ATH — zóna nákupu`, tone: 'warning' });
        }
      }
    }
  }

  if (items.length === 0) {
    items.push({ icon: Activity, label: 'Načítavam trhové dáta…', tone: 'info' });
  }

  return (
    <div className="glass-card p-3 space-y-2">
      <div className="flex items-center gap-1.5">
        <Activity className="w-3.5 h-3.5 text-primary" />
        <h2 className="text-xs font-bold text-foreground uppercase tracking-wide">Dnes najdôležitejšie</h2>
      </div>
      <div className="space-y-1.5">
        {items.slice(0, 4).map((item, i) => {
          const Icon = item.icon;
          return (
            <div key={i} className={`flex items-center gap-2 px-2.5 py-1.5 rounded-md border text-xs ${toneClasses(item.tone)}`}>
              <Icon className="w-3.5 h-3.5 shrink-0" />
              <span className="font-medium truncate">{item.label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
