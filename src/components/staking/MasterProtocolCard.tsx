import { Lang } from '@/lib/i18n';
import { ShoppingCart, Sparkles, Shield, ArrowRight, Bitcoin, Coins } from 'lucide-react';

interface Props { lang: Lang; }

interface Route {
  symbol: string;
  color: string;
  base: string;
  bridge: string;
  steps: { label: string; pct: number; protocol: string; apy?: string; chain: string }[];
}

const ROUTES: Route[] = [
  {
    symbol: 'BTC',
    color: '#F7931A',
    base: 'cbBTC (Base)',
    bridge: 'Garden.finance — Atomic Swap → Native BTC',
    steps: [
      { label: 'Cold Storage', pct: 64, protocol: 'Hardware wallet', chain: 'BTC L1' },
      { label: 'Babylon Staking', pct: 22, protocol: 'Babylon (Native BTC)', apy: '3–5 %', chain: 'BTC L1' },
      { label: 'LBTC výnos', pct: 14, protocol: 'Beefy / Lombard', apy: '8–14 %', chain: 'Arbitrum' },
    ],
  },
  {
    symbol: 'ETH',
    color: '#627EEA',
    base: 'WETH (Base)',
    bridge: 'Jumper Exchange → Native ETH (Mainnet)',
    steps: [
      { label: 'Native ETH (HODL)', pct: 41, protocol: 'Hardware wallet', chain: 'Ethereum' },
      { label: 'stETH', pct: 32, protocol: 'Lido (cez CoW Swap)', apy: '~3.2 %', chain: 'Ethereum' },
      { label: 'rETH vault', pct: 27, protocol: 'Beefy (Across.to → ARB)', apy: '7–11 %', chain: 'Arbitrum' },
    ],
  },
  {
    symbol: 'SOL',
    color: '#9945FF',
    base: 'SOL (Base)',
    bridge: 'Jumper Exchange → Native SOL',
    steps: [
      { label: 'Native SOL (HODL)', pct: 36, protocol: 'Phantom wallet', chain: 'Solana' },
      { label: 'jitoSOL', pct: 33, protocol: 'Jito (cez Jupiter)', apy: '~7.5 %', chain: 'Solana' },
      { label: 'Kamino Multiply', pct: 31, protocol: 'Kamino (jitoSOL, bez páky)', apy: '12–20 %', chain: 'Solana' },
    ],
  },
];

export function MasterProtocolCard({ lang }: Props) {
  const isSk = lang === 'sk';

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="glass-card p-4 space-y-2 border border-primary/20">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-primary" />
          <h2 className="text-sm font-bold text-foreground">Master Protokol 2026</h2>
        </div>
        <p className="text-[11px] text-muted-foreground leading-relaxed">
          {isSk
            ? 'Spojený systém: Súkromie (No-KYC) · Bezpečnosť (Mainnet/Native) · Výnos (Beefy / Kamino / Babylon).'
            : 'Unified system: Privacy (No-KYC) · Security (Mainnet/Native) · Yield (Beefy / Kamino / Babylon).'}
        </p>
        <div className="flex flex-wrap gap-1.5 pt-1">
          <span className="text-[9px] px-1.5 py-0.5 rounded bg-primary/10 text-primary border border-primary/20">No-KYC</span>
          <span className="text-[9px] px-1.5 py-0.5 rounded bg-gain/10 text-gain border border-gain/20">Native L1</span>
          <span className="text-[9px] px-1.5 py-0.5 rounded bg-accent/10 text-accent border border-accent/20">MEV ochrana</span>
        </div>
      </div>

      {/* PHASE 1: Accumulation */}
      <div className="glass-card p-4 space-y-3">
        <div className="flex items-center gap-2">
          <ShoppingCart className="w-4 h-4 text-accent" />
          <h3 className="text-sm font-semibold text-foreground">
            {isSk ? '🛠️ Fáza 1: Akumulácia (každý pondelok)' : '🛠️ Phase 1: Accumulation (every Monday)'}
          </h3>
        </div>
        <div className="bg-secondary/40 rounded-lg p-3 space-y-2">
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-muted-foreground">{isSk ? 'Sieť' : 'Network'}</span>
            <span className="font-medium text-foreground">Base</span>
          </div>
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-muted-foreground">{isSk ? 'Miesto' : 'Venue'}</span>
            <span className="font-medium text-foreground">swap.cow.fi (Rabby)</span>
          </div>
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-muted-foreground">{isSk ? 'Akcia' : 'Action'}</span>
            <span className="font-medium text-foreground">3× Limit Orders</span>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {[
            { sym: 'cbBTC', color: '#F7931A', pct: 64 },
            { sym: 'WETH', color: '#627EEA', pct: 25 },
            { sym: 'SOL', color: '#9945FF', pct: 11 },
          ].map(t => (
            <div key={t.sym} className="bg-secondary/40 rounded-lg p-2 text-center">
              <div className="text-[10px] font-bold" style={{ color: t.color }}>{t.sym}</div>
              <div className="text-[10px] text-muted-foreground mt-0.5">{t.pct}%</div>
            </div>
          ))}
        </div>
        <p className="text-[10px] text-muted-foreground italic">
          {isSk ? 'Cieľ: Vybudovať pozíciu s MEV ochranou bez plynu pri čakaní.' : 'Goal: Build position with MEV protection, no gas while waiting.'}
        </p>
      </div>

      {/* PHASE 2: Monthly cleanup + routes */}
      <div className="glass-card p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Shield className="w-4 h-4 text-gain" />
          <h3 className="text-sm font-semibold text-foreground">
            {isSk ? '🧼 Fáza 2: Mesačná očista (raz / nedeľa)' : '🧼 Phase 2: Monthly cleanup (Sunday)'}
          </h3>
        </div>
        <p className="text-[11px] text-muted-foreground">
          {isSk
            ? 'Pretrhne väzbu na Base a rozdelí majetok do bezpečia podľa trasy:'
            : 'Breaks the link to Base and splits assets to safety per route:'}
        </p>

        {ROUTES.map(route => (
          <div key={route.symbol} className="bg-secondary/30 rounded-lg p-3 space-y-2 border border-border/50">
            {/* Route header */}
            <div className="flex items-center gap-2">
              {route.symbol === 'BTC' ? (
                <Bitcoin className="w-3.5 h-3.5" style={{ color: route.color }} />
              ) : (
                <Coins className="w-3.5 h-3.5" style={{ color: route.color }} />
              )}
              <span className="text-xs font-bold" style={{ color: route.color }}>{route.symbol}</span>
              <span className="text-[10px] text-muted-foreground">{isSk ? 'trasa' : 'route'}</span>
            </div>

            {/* Bridge */}
            <div className="flex items-center gap-1.5 text-[10px] bg-background/40 rounded px-2 py-1.5">
              <span className="text-muted-foreground shrink-0">{route.base}</span>
              <ArrowRight className="w-2.5 h-2.5 text-muted-foreground shrink-0" />
              <span className="text-foreground font-medium">{route.bridge}</span>
            </div>

            {/* Steps */}
            <div className="space-y-1.5">
              {route.steps.map((s, i) => (
                <div key={i} className="flex items-start gap-2 text-[10px]">
                  <span
                    className="px-1.5 py-0.5 rounded font-bold shrink-0"
                    style={{ backgroundColor: route.color + '20', color: route.color }}
                  >
                    {s.pct}%
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium text-foreground truncate">{s.label}</span>
                      {s.apy && <span className="text-gain font-medium shrink-0">{s.apy} APY</span>}
                    </div>
                    <div className="text-muted-foreground truncate">
                      {s.protocol} · <span className="text-accent">{s.chain}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Tips */}
      <div className="glass-card p-4 space-y-2">
        <h3 className="text-sm font-semibold text-foreground">
          {isSk ? '💡 Finálne rady' : '💡 Final tips'}
        </h3>
        <ul className="text-[11px] text-muted-foreground space-y-1">
          <li>• <span className="text-foreground">Rabby účty:</span> „Vstup (Base)", „Trezor (L1)", „Výnos (ARB)"</li>
          <li>• <span className="text-foreground">{isSk ? 'Poplatky' : 'Fees'}:</span> {isSk ? 'Mainnet a BTC sieť len v nedeľu (najnižší plyn).' : 'Mainnet and BTC only on Sunday (lowest gas).'}</li>
          <li>• <span className="text-foreground">{isSk ? 'Bezpečnosť' : 'Safety'}:</span> Kamino Multiply <span className="text-loss font-medium">bez páky</span>.</li>
        </ul>
      </div>
    </div>
  );
}
