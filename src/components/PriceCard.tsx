import { TokenConfig, formatPrice } from '@/lib/crypto';

interface PriceCardProps {
  token: TokenConfig;
  price: number;
  change24h?: number;
}

export function PriceCard({ token, price, change24h }: PriceCardProps) {
  const isPositive = (change24h ?? 0) >= 0;

  return (
    <div className="glass-card p-4 flex items-center justify-between">
      <div className="flex items-center gap-3">
        <div
          className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold"
          style={{ backgroundColor: token.color + '20', color: token.color }}
        >
          {token.symbol.slice(0, 2)}
        </div>
        <div>
          <p className="font-semibold text-foreground">{token.symbol}</p>
          <p className="text-xs text-muted-foreground">{token.name}</p>
        </div>
      </div>
      <div className="text-right">
        <p className="font-semibold text-foreground">{formatPrice(price)}</p>
        {change24h !== undefined && (
          <p className={`text-xs font-medium ${isPositive ? 'text-gain' : 'text-loss'}`}>
            {isPositive ? '+' : ''}{change24h.toFixed(2)}%
          </p>
        )}
      </div>
    </div>
  );
}
