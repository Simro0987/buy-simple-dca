import { TrendingUp, Zap, Building2, Layers, Activity, Cpu } from 'lucide-react';

interface Narrative {
  symbol: string;
  name: string;
  color: string;
  icon: typeof TrendingUp;
  focusPoints: string[];
  status: string;
  statusColor: string;
}

const NARRATIVES: Narrative[] = [
  {
    symbol: 'BTC',
    name: 'Bitcoin',
    color: '#F7931A',
    icon: Building2,
    focusPoints: [
      'Inštitucionálne toky & ETF prílevy',
      'Odchýlka od 200-týždňového MA',
      'Likvidita a makro korelácia',
    ],
    status: 'Stabilná akumulácia / Inštitucionálny štandard',
    statusColor: 'text-emerald-400',
  },
  {
    symbol: 'ETH',
    name: 'Ethereum',
    color: '#627EEA',
    icon: Layers,
    focusPoints: [
      'Liquid staking výnosy (Rocket Pool)',
      'Dezinflačný model po Merge',
      'On-chain aktivita & DeFi TVL',
    ],
    status: 'Dezinflačný yield / On-chain aktivita',
    statusColor: 'text-blue-400',
  },
  {
    symbol: 'SOL',
    name: 'Solana',
    color: '#9945FF',
    icon: Zap,
    focusPoints: [
      'Vysoká priepustnosť & nízke poplatky',
      'Liquid deriváty (JitoSOL MEV výnosy)',
      'On-chain aktivita & retail adopcia',
    ],
    status: 'Vysokorýchlostný ekosystém / Retail',
    statusColor: 'text-violet-400',
  },
];

export function AssetNarratives() {
  return (
    <div className="glass-card p-4">
      <div className="flex items-center gap-2 mb-4">
        <Activity className="w-3.5 h-3.5 text-muted-foreground" />
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
          Info Radar — Kľúčové naratívy
        </p>
      </div>

      <div className="space-y-3">
        {NARRATIVES.map((n) => {
          const Icon = n.icon;
          return (
            <div
              key={n.symbol}
              className="rounded-xl p-3 bg-secondary/40 border border-border/50"
              style={{ borderLeftColor: n.color, borderLeftWidth: 3 }}
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <div
                    className="w-6 h-6 rounded-full flex items-center justify-center"
                    style={{ backgroundColor: n.color + '22' }}
                  >
                    <Icon className="w-3.5 h-3.5" style={{ color: n.color }} />
                  </div>
                  <span className="text-sm font-bold text-foreground">{n.symbol}</span>
                  <span className="text-[10px] text-muted-foreground">{n.name}</span>
                </div>
                <Cpu className="w-3 h-3 text-muted-foreground/40" />
              </div>

              <ul className="space-y-1 mb-2.5">
                {n.focusPoints.map((point) => (
                  <li key={point} className="flex items-start gap-1.5 text-[11px] text-muted-foreground">
                    <span
                      className="mt-1.5 w-1 h-1 rounded-full shrink-0"
                      style={{ backgroundColor: n.color + 'aa' }}
                    />
                    {point}
                  </li>
                ))}
              </ul>

              <div className="flex items-center gap-1.5 pt-2 border-t border-border/40">
                <TrendingUp className="w-3 h-3 shrink-0" style={{ color: n.color }} />
                <p className={`text-[10px] font-semibold ${n.statusColor}`}>{n.status}</p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
