import { Lang } from '@/lib/i18n';
import { PriceData, TOKENS } from '@/lib/crypto';
import { Scale, ArrowRight } from 'lucide-react';

interface Props {
  lang: Lang;
  prices?: PriceData;
}

const TARGET: Record<string, number> = { BTC: 59, ETH: 25, SOL: 11, HYPE: 5 };
const DRIFT_THRESHOLD = 5; // percent

function getHoldings(): Record<string, number> {
  try {
    const raw = localStorage.getItem('smart-alloc-holdings');
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}

interface Drift {
  symbol: string;
  current: number;
  target: number;
  diff: number;
  color: string;
}

export function RebalanceCard({ lang, prices }: Props) {
  const sk = lang === 'sk';
  const holdings = getHoldings();

  if (!prices) return null;

  // Calculate current allocation
  let totalValue = 0;
  const tokenValues: Record<string, number> = {};
  for (const token of TOKENS) {
    const key = token.symbol.toLowerCase();
    const qty = holdings[key] || 0;
    const price = prices[token.coingeckoId]?.usd || 0;
    const value = qty * price;
    tokenValues[token.symbol] = value;
    totalValue += value;
  }

  if (totalValue <= 0) return null;

  const drifts: Drift[] = [];
  for (const token of TOKENS) {
    const currentPct = (tokenValues[token.symbol] / totalValue) * 100;
    const targetPct = TARGET[token.symbol] || 0;
    const diff = currentPct - targetPct;
    if (Math.abs(diff) >= DRIFT_THRESHOLD) {
      drifts.push({
        symbol: token.symbol,
        current: currentPct,
        target: targetPct,
        diff,
        color: token.color,
      });
    }
  }

  if (drifts.length === 0) return null;

  return (
    <div className="glass-card p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Scale className="w-4 h-4 text-warning" />
        <span className="text-sm font-semibold text-foreground">
          {sk ? 'Rebalancing odporúčania' : 'Rebalancing Suggestions'}
        </span>
      </div>

      <div className="space-y-2">
        {drifts.map(d => (
          <div key={d.symbol} className="flex items-center gap-3 p-2.5 rounded-lg bg-secondary/50">
            <div
              className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
              style={{ backgroundColor: d.color + '20', color: d.color }}
            >
              {d.symbol.slice(0, 2)}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 text-xs">
                <span className="text-muted-foreground">{d.current.toFixed(1)}%</span>
                <ArrowRight className="w-3 h-3 text-muted-foreground" />
                <span className="font-bold text-foreground">{d.target}%</span>
              </div>
              <p className="text-[10px] text-muted-foreground mt-0.5">
                {d.diff > 0
                  ? (sk ? `Prevážený o ${d.diff.toFixed(1)}% — zváž zníženie` : `Overweight by ${d.diff.toFixed(1)}% — consider reducing`)
                  : (sk ? `Podvážený o ${Math.abs(d.diff).toFixed(1)}% — zváž doplnenie` : `Underweight by ${Math.abs(d.diff).toFixed(1)}% — consider adding`)
                }
              </p>
            </div>
            <span className={`text-sm font-bold flex-shrink-0 ${d.diff > 0 ? 'text-loss' : 'text-gain'}`}>
              {d.diff > 0 ? '+' : ''}{d.diff.toFixed(1)}%
            </span>
          </div>
        ))}
      </div>

      <p className="text-[10px] text-muted-foreground">
        {sk
          ? '⚠️ Odchýlka > 5% od cieľovej alokácie. Zváž rebalancing pri najbližšom DCA.'
          : '⚠️ Drift > 5% from target allocation. Consider rebalancing on next DCA.'}
      </p>
    </div>
  );
}
