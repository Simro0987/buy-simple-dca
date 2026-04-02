import { Lang } from '@/lib/i18n';
import { STAKING_CONFIG, StakingPosition } from '@/lib/wallets';
import { Lock, TrendingUp, Landmark } from 'lucide-react';

interface Props { lang: Lang; }

function typeIcon(type: StakingPosition['type']) {
  if (type === 'staking') return <TrendingUp className="w-3.5 h-3.5 text-gain" />;
  if (type === 'lending') return <Landmark className="w-3.5 h-3.5 text-accent" />;
  return <Lock className="w-3.5 h-3.5 text-muted-foreground" />;
}

function typeLabel(type: StakingPosition['type'], lang: Lang) {
  const labels = {
    sk: { hold: 'HODL', staking: 'Staking', lending: 'Lending' },
    en: { hold: 'HODL', staking: 'Staking', lending: 'Lending' },
  };
  return labels[lang][type];
}

function yieldLabel(dir: StakingPosition['yieldDirection'], lang: Lang) {
  if (!dir || dir === 'none') return null;
  const labels = {
    sk: { btc: 'Výnos ide do BTC', restake: 'Re-stake', compound: 'Auto-compound' },
    en: { btc: 'Yield → BTC', restake: 'Re-stake', compound: 'Auto-compound' },
  };
  return labels[lang][dir];
}

export function StakingPage({ lang }: Props) {
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold text-foreground">
        {lang === 'sk' ? 'Staking & Výnosy' : 'Staking & Yields'}
      </h1>

      <p className="text-xs text-muted-foreground">
        {lang === 'sk'
          ? 'Prehľad kde pracuje tvoj kapitál. Žiadne akcie – len informácie.'
          : 'Overview of where your capital works. No actions – information only.'}
      </p>

      {STAKING_CONFIG.map(asset => (
        <div key={asset.symbol} className="glass-card p-4 space-y-3">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div
                className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold"
                style={{ backgroundColor: asset.color + '20', color: asset.color }}
              >
                {asset.symbol.slice(0, 2)}
              </div>
              <div>
                <p className="font-semibold text-foreground text-sm">{asset.symbol}</p>
                <p className="text-[11px] text-muted-foreground">{asset.name}</p>
              </div>
            </div>
            <span className="text-sm font-bold text-foreground">{asset.allocation}%</span>
          </div>

          {/* Positions */}
          <div className="space-y-2">
            {asset.positions.map((pos, i) => {
              const yield_ = yieldLabel(pos.yieldDirection, lang);
              return (
                <div key={i} className="flex items-start gap-2.5 bg-secondary/40 rounded-lg px-3 py-2">
                  {typeIcon(pos.type)}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-foreground">{pos.label}</span>
                      <span className="text-xs font-bold text-foreground">{pos.percentage}%</span>
                    </div>
                    <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-secondary text-secondary-foreground">
                        {typeLabel(pos.type, lang)}
                      </span>
                      {pos.protocol && (
                        <span className="text-[10px] text-muted-foreground">{pos.protocol}</span>
                      )}
                      {pos.apy != null && (
                        <span className="text-[10px] text-gain font-medium">{pos.apy}% APY</span>
                      )}
                    </div>
                    {yield_ && (
                      <p className="text-[10px] text-accent mt-1">→ {yield_}</p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Visual bar */}
          <div className="flex h-2 rounded-full overflow-hidden bg-secondary">
            {asset.positions.map((pos, i) => {
              const colors = { hold: 'bg-muted-foreground/40', staking: 'bg-gain', lending: 'bg-accent' };
              return (
                <div
                  key={i}
                  className={`${colors[pos.type]} transition-all`}
                  style={{ width: `${pos.percentage}%` }}
                />
              );
            })}
          </div>
        </div>
      ))}

      {/* Yield flow summary */}
      <div className="glass-card p-4 space-y-2">
        <p className="text-sm font-semibold text-foreground">
          {lang === 'sk' ? 'Tok výnosov' : 'Yield Flow'}
        </p>
        <div className="space-y-1.5">
          <p className="text-xs text-muted-foreground">
            • ETH + SOL {lang === 'sk' ? 'výnosy' : 'yields'} → BTC ({lang === 'sk' ? '15. deň' : 'Day 15'})
          </p>
          <p className="text-xs text-muted-foreground">
            • HYPE → Re-stake ({lang === 'sk' ? 'automaticky' : 'auto'})
          </p>
          <p className="text-xs text-muted-foreground">
            • BTC → {lang === 'sk' ? 'bez výnosu (cold storage)' : 'No yield (cold storage)'}
          </p>
        </div>
      </div>
    </div>
  );
}
