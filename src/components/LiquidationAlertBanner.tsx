import { AlertOctagon } from 'lucide-react';
import { usePrices } from '@/hooks/usePrices';
import { useLiquidationLevels, evaluateLiquidations, BUFFER_PCT, type LiqSymbol } from '@/lib/liquidationLevels';
import { Lang } from '@/lib/i18n';
import { formatPrice } from '@/lib/crypto';

const CG_ID: Record<LiqSymbol, string> = { BTC: 'bitcoin', ETH: 'ethereum', SOL: 'solana' };

interface Props { lang: Lang; }

export function LiquidationAlertBanner({ lang }: Props) {
  const sk = lang === 'sk';
  const { data: prices } = usePrices();
  // subscribe to liquidation store (re-render on edits)
  useLiquidationLevels();

  if (!prices) return null;
  const priceMap: Partial<Record<LiqSymbol, number>> = {
    BTC: prices['bitcoin']?.usd,
    ETH: prices['ethereum']?.usd,
    SOL: prices['solana']?.usd,
  };
  // Per spec: BTC and SOL only
  const status = evaluateLiquidations(priceMap).filter(s => s.symbol === 'BTC' || s.symbol === 'SOL');
  const critical = status.filter(s => s.critical);
  if (critical.length === 0) return null;

  return (
    <div
      role="alert"
      className="relative overflow-hidden rounded-lg border border-rose-500/60 bg-rose-500/10 px-3 py-2.5 animate-pulse"
    >
      <div className="absolute inset-0 bg-gradient-to-r from-rose-500/10 via-rose-500/20 to-rose-500/10 pointer-events-none" />
      <div className="relative flex items-start gap-2">
        <AlertOctagon className="w-4 h-4 text-rose-400 mt-0.5 shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-[11px] font-bold text-rose-200 leading-tight">
            {sk
              ? 'KRITICKÉ RIZIKO: Cena blízko DeFi likvidačnej úrovne! Skontroluj kolaterál.'
              : 'CRITICAL RISK: Market price close to DeFi Liquidation levels! Check collateral.'}
          </p>
          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5">
            {critical.map(s => (
              <span key={s.symbol} className="text-[10px] font-mono tabular-nums text-rose-200/90">
                <span className="font-bold">{s.symbol}</span>{' '}
                {formatPrice(s.marketPrice)} → liq {formatPrice(s.liqPrice)}{' '}
                <span className="text-rose-300">
                  ({s.distancePct >= 0 ? '+' : ''}{s.distancePct.toFixed(1)}%)
                </span>
              </span>
            ))}
          </div>
          <p className="mt-0.5 text-[9px] text-rose-200/60">
            {sk ? `Spúšť: do ${BUFFER_PCT}% nad likvidačnou cenou.` : `Trigger: within ${BUFFER_PCT}% above liquidation price.`}
          </p>
        </div>
      </div>
    </div>
  );
}
