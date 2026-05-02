import { useState } from 'react';
import { Calculator } from 'lucide-react';
import { Lang } from '@/lib/i18n';
import { STAKING_CONFIG } from '@/lib/wallets';
import { Input } from '@/components/ui/input';

interface Props { lang: Lang; }

export function StakingCalculator({ lang }: Props) {
  const isSk = lang === 'sk';
  const [amounts, setAmounts] = useState<Record<string, string>>({ BTC: '', ETH: '', SOL: '' });

  return (
    <div className="glass-card p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Calculator className="w-4 h-4 text-primary" />
        <h2 className="text-sm font-bold text-foreground">
          {isSk ? 'Staking kalkulačka' : 'Staking calculator'}
        </h2>
      </div>
      <p className="text-[11px] text-muted-foreground">
        {isSk
          ? 'Zadaj koľko tokenov máš a uvidíš presné rozdelenie podľa Master Protokolu.'
          : 'Enter how many tokens you have to see the exact split per Master Protocol.'}
      </p>

      <div className="space-y-3">
        {STAKING_CONFIG.map(asset => {
          const raw = amounts[asset.symbol] ?? '';
          const total = parseFloat(raw.replace(',', '.')) || 0;
          return (
            <div key={asset.symbol} className="bg-secondary/30 rounded-lg p-3 space-y-2 border border-border/40">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <div
                    className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold"
                    style={{ backgroundColor: asset.color + '20', color: asset.color }}
                  >
                    {asset.symbol}
                  </div>
                  <span className="text-xs font-semibold text-foreground">{asset.name}</span>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  inputMode="decimal"
                  placeholder={isSk ? `Počet ${asset.symbol}` : `${asset.symbol} amount`}
                  value={raw}
                  onChange={e => setAmounts(prev => ({ ...prev, [asset.symbol]: e.target.value }))}
                  className="h-9 text-sm"
                />
                <span className="text-xs text-muted-foreground shrink-0">{asset.symbol}</span>
              </div>

              {total > 0 && (
                <div className="space-y-1.5 pt-1">
                  {asset.positions.map((pos, i) => {
                    const amount = (total * pos.percentage) / 100;
                    return (
                      <div key={i} className="flex items-center justify-between text-[11px] bg-background/40 rounded px-2 py-1.5">
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-foreground truncate">{pos.label}</div>
                          {pos.protocol && (
                            <div className="text-[10px] text-muted-foreground truncate">
                              {pos.protocol} · {pos.percentage}%
                            </div>
                          )}
                        </div>
                        <div className="text-right shrink-0 ml-2">
                          <div className="font-bold text-foreground">
                            {amount.toLocaleString(undefined, { maximumFractionDigits: 6 })}
                          </div>
                          <div className="text-[10px]" style={{ color: asset.color }}>{asset.symbol}</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
