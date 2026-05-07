import { Lang } from '@/lib/i18n';
import { Sparkles } from 'lucide-react';

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
    base: 'Base → Native BTC',
    bridge: 'BTC bridge → HW peňaženka · Babylon · LBTC → Morpho Blue (ARB)',
    steps: [
      { label: 'HODL (HW peňaženka)', pct: 42, protocol: 'Hardware wallet', chain: 'BTC L1' },
      { label: 'Babylon Staking', pct: 22, protocol: 'Babylon (z HW)', apy: '~7 %', chain: 'BTC L1' },
      { label: 'Yield Port — LBTC', pct: 14, protocol: 'Lombard → Morpho Blue', apy: '8–14 %', chain: 'Arbitrum' },
    ],
  },
  {
    symbol: 'ETH',
    color: '#627EEA',
    base: 'Base → Mainnet ETH',
    bridge: 'CoW Swap → stETH | wstETH → ether.fi (weETH) → Morpho Blue (ARB)',
    steps: [
      { label: 'Native HODL (HW)', pct: 41, protocol: 'Hardware wallet', chain: 'Ethereum' },
      { label: 'stETH (CoW Swap, Mainnet)', pct: 32, protocol: 'Lido', apy: '~3.2 %', chain: 'Ethereum' },
      { label: 'wstETH → weETH v Morpho Blue', pct: 27, protocol: 'ether.fi → Morpho Blue', apy: '7–11 %', chain: 'Arbitrum' },
    ],
  },
  {
    symbol: 'SOL',
    color: '#9945FF',
    base: 'Base → Native SOL',
    bridge: 'jito.network → jitoSOL · Jito Vault Aggregator → ezSOL → Kamino Lend (bez páky)',
    steps: [
      { label: 'HODL (peňaženka)', pct: 36, protocol: 'Wallet', chain: 'Solana' },
      { label: 'jitoSOL (zvyšok po prelive)', pct: 44, protocol: 'jito.network', apy: '~7.5 %', chain: 'Solana' },
      { label: 'ezSOL → Kamino Lend (32 % z 64 %)', pct: 20, protocol: 'Jito Vault Aggregator → Kamino', apy: '~8 %', chain: 'Solana' },
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

      {/* Phase sections removed per user request */}

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
