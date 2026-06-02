// Analýza Staking Kontrahentov — visualizes protocol concentration risk
// from the manual staking ledger (staked_balances). Pure read-only widget.
import { useMemo } from 'react';
import { ShieldAlert } from 'lucide-react';
import { useStakingLedger } from '@/hooks/useStakingLedger';
import { usePortfolio } from '@/contexts/PortfolioContext';
import { nativeTicker } from '@/lib/tickerLabels';
import { Lang } from '@/lib/i18n';

type RiskTier = 'low' | 'moderate' | 'high';

// Protocol → risk mapping (Native / institutional = low; liquid staking = moderate; DeFi pools / restaking = high)
const PROTOCOL_RISK: Array<{ match: RegExp; tier: RiskTier }> = [
  { match: /kiln|babylon|solo|native/i, tier: 'low' },
  { match: /lido|rocket|jito|marinade|stETH|ezSOL|jitoSOL/i, tier: 'moderate' },
  { match: /eigen|morpho|aave|kamino|renzo|lombard|LBTC|defi|pool/i, tier: 'high' },
];

function classifyProtocol(protocol: string): RiskTier {
  for (const r of PROTOCOL_RISK) if (r.match.test(protocol)) return r.tier;
  return 'moderate';
}

const TIER_META: Record<RiskTier, { label: string; cls: string; bar: string }> = {
  low:      { label: 'Nízke',   cls: 'text-gain',    bar: 'bg-gain' },
  moderate: { label: 'Stredné', cls: 'text-warning', bar: 'bg-warning' },
  high:     { label: 'Vysoké',  cls: 'text-loss',    bar: 'bg-loss' },
};

interface Props { lang: Lang }

export function CounterpartyRiskCard({ lang }: Props) {
  const { entries } = useStakingLedger();
  const { breakdown, prices } = usePortfolio();
  const sk = lang === 'sk';

  const { rows, totals, totalUsd } = useMemo(() => {
    const priceFor = (s: string) => {
      if (s === 'BTC') return prices?.bitcoin?.usd ?? 0;
      if (s === 'ETH') return prices?.ethereum?.usd ?? 0;
      if (s === 'SOL') return prices?.solana?.usd ?? 0;
      return 0;
    };
    const rows = entries.map(e => {
      const tier = classifyProtocol(e.protocol);
      const usd = e.amount * priceFor(e.symbol);
      return { ...e, symbol: nativeTicker(e.symbol), tier, usd };
    });
    const totals: Record<RiskTier, number> = { low: 0, moderate: 0, high: 0 };
    for (const r of rows) totals[r.tier] += r.usd;
    const totalUsd = totals.low + totals.moderate + totals.high;
    return { rows, totals, totalUsd };
  }, [entries, prices, breakdown]);

  return (
    <div className="glass-card p-4 space-y-3">
      <h2 className="text-sm font-bold text-foreground flex items-center gap-2">
        <ShieldAlert className="w-4 h-4" />
        {sk ? 'Analýza Staking Kontrahentov' : 'Staking Counterparty Analysis'}
      </h2>

      {totalUsd <= 0 ? (
        <p className="text-xs text-muted-foreground">
          {sk
            ? 'Žiadne aktívne pozície v ledgeri. Pridajte vklad v sekcii Stake.'
            : 'No active positions in the ledger. Add a deposit in the Stake tab.'}
        </p>
      ) : (
        <>
          {/* Distribution bar */}
          <div className="space-y-1">
            <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-secondary">
              {(['low', 'moderate', 'high'] as RiskTier[]).map(tier => {
                const pct = totalUsd ? (totals[tier] / totalUsd) * 100 : 0;
                if (pct <= 0) return null;
                return (
                  <div
                    key={tier}
                    className={`${TIER_META[tier].bar} h-full`}
                    style={{ width: `${pct}%` }}
                  />
                );
              })}
            </div>
            <div className="flex justify-between text-[10px] text-muted-foreground">
              {(['low', 'moderate', 'high'] as RiskTier[]).map(tier => (
                <span key={tier} className={TIER_META[tier].cls}>
                  {TIER_META[tier].label}: {totalUsd ? ((totals[tier] / totalUsd) * 100).toFixed(0) : 0}%
                </span>
              ))}
            </div>
          </div>

          {/* Per-position rows */}
          <div className="space-y-1.5">
            {rows.map((r, i) => (
              <div key={i} className="flex items-center justify-between py-1.5 border-b border-border/30 last:border-0">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-[10px] font-bold w-7 text-muted-foreground">{r.symbol}</span>
                  <span className="text-xs text-foreground truncate">{r.protocol}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] tabular-nums text-muted-foreground">
                    ${r.usd.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                  </span>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full bg-secondary ${TIER_META[r.tier].cls}`}>
                    {TIER_META[r.tier].label}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
